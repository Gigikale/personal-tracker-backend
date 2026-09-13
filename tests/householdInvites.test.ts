import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/prisma';
import { resetDatabase } from './helpers/resetDb';
import { signupUser } from './helpers/testUser';

jest.mock('../src/lib/email', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendHouseholdInviteEmail: jest.fn().mockResolvedValue(undefined),
  sendHouseholdMemberRemovedEmail: jest.fn().mockResolvedValue(undefined),
}));

import { sendHouseholdInviteEmail, sendHouseholdMemberRemovedEmail } from '../src/lib/email';

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
  jest.clearAllMocks();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function auth(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

describe('household invites', () => {
  it('adds an existing user immediately and emails + notifies them', async () => {
    const owner = await signupUser(app, { email: 'owner@example.com' });
    const partner = await signupUser(app, { email: 'partner@example.com' });

    const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Our home' });

    const addRes = await request(app)
      .post(`/households/${household.body.id}/members`)
      .set(auth(owner.accessToken))
      .send({ email: 'partner@example.com' });

    expect(addRes.status).toBe(201);
    expect(addRes.body.members).toHaveLength(2);
    expect(addRes.body.invitedPending).toBe(false);
    expect(sendHouseholdInviteEmail).toHaveBeenCalledWith(
      'partner@example.com',
      expect.objectContaining({ hasAccount: true }),
    );

    const notifs = await request(app).get('/notifications').set(auth(partner.accessToken));
    expect(notifs.body.find((n: { type: string }) => n.type === 'HOUSEHOLD_INVITE')).toBeDefined();
  });

  it('holds a pending invite for an email with no account yet, without adding a member', async () => {
    const owner = await signupUser(app, { email: 'owner2@example.com' });

    const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Home' });

    const addRes = await request(app)
      .post(`/households/${household.body.id}/members`)
      .set(auth(owner.accessToken))
      .send({ email: 'newperson@example.com' });

    expect(addRes.status).toBe(201);
    expect(addRes.body.members).toHaveLength(1);
    expect(addRes.body.invitedPending).toBe(true);
    expect(sendHouseholdInviteEmail).toHaveBeenCalledWith(
      'newperson@example.com',
      expect.objectContaining({ hasAccount: false }),
    );
  });

  it('auto-adds the invited person to the household the moment they sign up', async () => {
    const owner = await signupUser(app, { email: 'owner3@example.com' });
    const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Home' });

    await request(app)
      .post(`/households/${household.body.id}/members`)
      .set(auth(owner.accessToken))
      .send({ email: 'newperson2@example.com' });

    const newUser = await signupUser(app, { email: 'newperson2@example.com' });

    const view = await request(app).get(`/households/${household.body.id}`).set(auth(newUser.accessToken));
    expect(view.status).toBe(200);
    expect(view.body.members.some((m: { userId: string }) => m.userId === newUser.user.id)).toBe(true);
  });

  it('does not link an expired invite', async () => {
    const owner = await signupUser(app, { email: 'owner4@example.com' });
    const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Home' });

    await request(app)
      .post(`/households/${household.body.id}/members`)
      .set(auth(owner.accessToken))
      .send({ email: 'expired@example.com' });

    await prisma.householdInvite.updateMany({
      where: { email: 'expired@example.com' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const newUser = await signupUser(app, { email: 'expired@example.com' });
    const view = await request(app).get(`/households/${household.body.id}`).set(auth(newUser.accessToken));
    expect(view.status).toBe(404);
  });

  it('emails and notifies a member removed by the owner, but not someone who leaves voluntarily', async () => {
    const owner = await signupUser(app, { email: 'owner5@example.com' });
    const partner = await signupUser(app, { email: 'partner5@example.com' });
    const other = await signupUser(app, { email: 'other5@example.com' });

    const household = await request(app).post('/households').set(auth(owner.accessToken)).send({ name: 'Home' });
    await request(app)
      .post(`/households/${household.body.id}/members`)
      .set(auth(owner.accessToken))
      .send({ email: 'partner5@example.com' });
    await request(app)
      .post(`/households/${household.body.id}/members`)
      .set(auth(owner.accessToken))
      .send({ email: 'other5@example.com' });
    jest.clearAllMocks();

    // Self-removal (leaving) should not trigger a notification or email.
    const leaveRes = await request(app)
      .delete(`/households/${household.body.id}/members/${other.user.id}`)
      .set(auth(other.accessToken));
    expect(leaveRes.status).toBe(204);
    expect(sendHouseholdMemberRemovedEmail).not.toHaveBeenCalled();

    // Removal by the owner should.
    const removeRes = await request(app)
      .delete(`/households/${household.body.id}/members/${partner.user.id}`)
      .set(auth(owner.accessToken));
    expect(removeRes.status).toBe(204);
    expect(sendHouseholdMemberRemovedEmail).toHaveBeenCalledWith('partner5@example.com', 'Home');

    const notifs = await request(app).get('/notifications').set(auth(partner.accessToken));
    expect(notifs.body.find((n: { type: string }) => n.type === 'HOUSEHOLD_MEMBER_REMOVED')).toBeDefined();
  });
});

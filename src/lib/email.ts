import { Resend } from 'resend';

import { env } from '../config/env';
import { logger } from './logger';

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured; skipping password reset email');
    return;
  }

  const { error } = await resend.emails.send({
    from: env.passwordResetFromEmail,
    to,
    subject: 'Reset your Personal Tracker password',
    html: `
      <p>Someone requested a password reset for this account.</p>
      <p><a href="${resetUrl}">Click here to choose a new password</a>. This link expires in 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });

  if (error) {
    // Resend's SDK returns errors rather than throwing. Log but don't propagate — the caller
    // (password reset) intentionally responds the same way whether or not the email went out,
    // so a delivery failure shouldn't be revealed to the requester either.
    logger.error({ error, to }, 'Failed to send password reset email');
  }
}

export async function sendHouseholdInviteEmail(
  to: string,
  opts: { householdName: string; inviterName: string; hasAccount: boolean },
): Promise<void> {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured; skipping household invite email');
    return;
  }

  const actionUrl = opts.hasAccount
    ? `${env.frontendUrl}/households`
    : `${env.frontendUrl}/signup?email=${encodeURIComponent(to)}`;
  const actionLabel = opts.hasAccount ? 'View the household' : 'Sign up to join';

  const { error } = await resend.emails.send({
    from: env.passwordResetFromEmail,
    to,
    subject: `${opts.inviterName} invited you to join "${opts.householdName}" on Personal Tracker`,
    html: `
      <p>${opts.inviterName} added you to the household "${opts.householdName}" on Personal Tracker.</p>
      ${
        opts.hasAccount
          ? ''
          : `<p>You don't have an account yet — sign up with this email address and you'll be added to the household automatically.</p>`
      }
      <p><a href="${actionUrl}">${actionLabel}</a></p>
    `,
  });

  if (error) {
    logger.error({ error, to }, 'Failed to send household invite email');
  }
}

export async function sendHouseholdMemberRemovedEmail(to: string, householdName: string): Promise<void> {
  if (!resend) {
    logger.warn('RESEND_API_KEY not configured; skipping household removal email');
    return;
  }

  const { error } = await resend.emails.send({
    from: env.passwordResetFromEmail,
    to,
    subject: `You were removed from "${householdName}" on Personal Tracker`,
    html: `<p>You've been removed from the household "${householdName}" on Personal Tracker. If you think this was a mistake, reach out to the household owner.</p>`,
  });

  if (error) {
    logger.error({ error, to }, 'Failed to send household removal email');
  }
}

import { prisma } from '../../prisma';
import { HttpError } from '../../lib/errors';
import { signAccessToken } from '../../lib/jwt';
import { hashPassword, verifyPassword } from '../../lib/password';
import { generateRefreshToken, hashRefreshToken } from '../../lib/refreshToken';
import type { LoginInput, SignupInput } from './auth.schemas';

interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  currency: string;
}

interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

const publicUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phoneNumber: true,
  currency: true,
} satisfies Record<keyof PublicUser, true>;

async function issueTokens(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken(userId);
  const { token, tokenHash, expiresAt } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt },
  });
  return { accessToken, refreshToken: token };
}

export async function signup(input: SignupInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const existingPhone = await prisma.user.findUnique({ where: { phoneNumber: input.phoneNumber } });
  if (existingPhone) {
    throw new HttpError(409, 'An account with this phone number already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phoneNumber: input.phoneNumber,
    },
    select: publicUserSelect,
  });

  const tokens = await issueTokens(user.id);
  return { user, ...tokens };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.passwordHash) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const tokens = await issueTokens(user.id);
  const publicUser: PublicUser = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumber: user.phoneNumber,
    currency: user.currency,
  };
  return { user: publicUser, ...tokens };
}

export async function refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored) {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }

  if (stored.revokedAt) {
    // This token was already rotated out — replaying it suggests it was stolen from an
    // earlier point in the chain. Kill every other active session for this user as a precaution.
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new HttpError(401, 'Session revoked due to a reused refresh token. Please log in again.');
  }

  if (stored.expiresAt < new Date()) {
    throw new HttpError(401, 'Invalid or expired refresh token');
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueTokens(stored.userId);
}

export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

import { prisma } from '../../prisma';
import { env } from '../../config/env';
import { HttpError } from '../../lib/errors';
import { sendPasswordResetEmail } from '../../lib/email';
import type { GoogleProfile } from '../../lib/googleOAuth';
import { signAccessToken } from '../../lib/jwt';
import { hashPassword, verifyPassword } from '../../lib/password';
import { generatePasswordResetToken, hashPasswordResetToken } from '../../lib/passwordResetToken';
import { generateRefreshToken, hashRefreshToken } from '../../lib/refreshToken';
import type { ForgotPasswordInput, LoginInput, ResetPasswordInput, SignupInput } from './auth.schemas';

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

export async function requestPasswordReset(input: ForgotPasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Always behave the same whether or not the account exists, so callers can't use this
  // endpoint to discover which emails have accounts.
  if (!user || !user.passwordHash) return;

  const { token, tokenHash, expiresAt } = generatePasswordResetToken();
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });

  const resetUrl = `${env.frontendUrl}/reset-password?token=${token}`;
  await sendPasswordResetEmail(user.email, resetUrl);
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const tokenHash = hashPasswordResetToken(input.token);
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new HttpError(400, 'This reset link is invalid or has expired');
  }

  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    // A password reset should end every other active session.
    prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function loginWithGoogle(profile: GoogleProfile): Promise<{ accessToken: string; refreshToken: string }> {
  const existingAccount = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: profile.googleId } },
  });
  if (existingAccount) {
    return issueTokens(existingAccount.userId);
  }

  const existingUser = await prisma.user.findUnique({ where: { email: profile.email } });
  if (existingUser) {
    // Only auto-link to an existing password account when Google has verified the email,
    // otherwise someone could add an unverified address they don't own to take over an account.
    if (!profile.emailVerified) {
      throw new HttpError(409, 'An account with this email already exists. Log in with your password instead.');
    }
    await prisma.oAuthAccount.create({
      data: { userId: existingUser.id, provider: 'GOOGLE', providerAccountId: profile.googleId },
    });
    return issueTokens(existingUser.id);
  }

  const user = await prisma.user.create({
    data: {
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      oauthAccounts: { create: { provider: 'GOOGLE', providerAccountId: profile.googleId } },
    },
  });
  return issueTokens(user.id);
}

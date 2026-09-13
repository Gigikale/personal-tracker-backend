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

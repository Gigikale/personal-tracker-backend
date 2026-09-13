import { env } from '../config/env';
import { HttpError } from './errors';

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
}

export function buildGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId ?? '',
    redirect_uri: `${env.backendUrl}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForGoogleProfile(code: string): Promise<GoogleProfile> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId ?? '',
      client_secret: env.googleClientSecret ?? '',
      redirect_uri: `${env.backendUrl}/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    throw new HttpError(400, 'Could not complete Google sign-in');
  }
  const tokenData = (await tokenRes.json()) as { access_token: string };

  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userRes.ok) {
    throw new HttpError(400, 'Could not complete Google sign-in');
  }
  const profile = (await userRes.json()) as {
    sub: string;
    email: string;
    email_verified: boolean;
    given_name?: string;
    family_name?: string;
    name?: string;
  };

  const [fallbackFirst, ...fallbackRest] = (profile.name ?? profile.email).split(' ');

  return {
    googleId: profile.sub,
    email: profile.email,
    emailVerified: profile.email_verified,
    firstName: profile.given_name ?? fallbackFirst ?? 'Google',
    lastName: profile.family_name ?? (fallbackRest.join(' ') || 'User'),
  };
}

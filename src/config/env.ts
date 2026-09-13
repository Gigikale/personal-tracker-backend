import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: required('DATABASE_URL'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshExpiresInDays: Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? 30),
  // Comma-separated list of allowed origins, e.g. "https://app.example.com,https://staging.example.com".
  // Left unset, CORS stays open to any origin (fine for local dev).
  corsOrigins: process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean),
  sentryDsn: process.env.SENTRY_DSN,
  resendApiKey: process.env.RESEND_API_KEY,
  passwordResetFromEmail: process.env.PASSWORD_RESET_FROM_EMAIL ?? 'Personal Tracker <onboarding@resend.dev>',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  backendUrl: process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
};

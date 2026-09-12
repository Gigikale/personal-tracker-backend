import jwt from 'jsonwebtoken';

import { env } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
}

export function signAccessToken(userId: string): string {
  const options: jwt.SignOptions = { expiresIn: env.jwtAccessExpiresIn as jwt.SignOptions['expiresIn'] };
  return jwt.sign({ sub: userId } satisfies AccessTokenPayload, env.jwtAccessSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

import jwt from 'jsonwebtoken';

import { appConfig } from '../config/env';
import { AppError } from './app-error';

type JwtPayload = Record<string, unknown>;

const ACCESS_TOKEN_TTL = '1h';

export function signJwt<T extends JwtPayload>(payload: T, options?: jwt.SignOptions): string {
  if (!appConfig.jwtSecret) {
    throw new AppError('JWT secret not configured', 500);
  }

  return jwt.sign(payload, appConfig.jwtSecret, {
    expiresIn: ACCESS_TOKEN_TTL,
    ...options,
  });
}

export function verifyJwt<T extends JwtPayload>(token: string): T {
  if (!appConfig.jwtSecret) {
    throw new AppError('JWT secret not configured', 500);
  }

  return jwt.verify(token, appConfig.jwtSecret) as T;
}


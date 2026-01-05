import type { NextFunction, Request, Response } from 'express';

import { verifyJwt } from '../utils/jwt';
import { AppError } from '../utils/app-error';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
    type?: 'user' | 'waiver_user';
    phone?: string;
  };
}

export function authGuard(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Unauthorized', 401));
  }

  const token = authHeader.replace('Bearer ', '').trim();

  try {
    const payload = verifyJwt<{
      sub: string;
      email?: string;
      phone?: string;
      roles: string[];
      type?: 'waiver_user';
    }>(token);
    const userObj: AuthenticatedRequest['user'] = {
      id: payload.sub,
      email: payload.email ?? '',
      roles: payload.roles ?? [],
      type: payload.type === 'waiver_user' ? 'waiver_user' : 'user',
    };
    if (payload.phone) userObj.phone = payload.phone;
    (req as AuthenticatedRequest).user = userObj;
    return next();
  } catch (error) {
    return next(new AppError('Invalid or expired token', 401, { cause: error }));
  }
}

/**
 * Auth guard that accepts both regular users and waiver-only users.
 * Use this for waiver routes that should work for both user types.
 */
export function waiverAuthGuard(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Unauthorized', 401));
  }

  const token = authHeader.replace('Bearer ', '').trim();

  try {
    const payload = verifyJwt<{
      sub: string;
      email?: string;
      phone?: string;
      roles?: string[];
      type?: 'waiver_user';
    }>(token);
    const userObj: AuthenticatedRequest['user'] = {
      id: payload.sub,
      email: payload.email ?? '',
      roles: payload.roles ?? [],
      type: payload.type === 'waiver_user' ? 'waiver_user' : 'user',
    };
    if (payload.phone) userObj.phone = payload.phone;
    (req as AuthenticatedRequest).user = userObj;
    return next();
  } catch (error) {
    return next(new AppError('Invalid or expired token', 401, { cause: error }));
  }
}

/**
 * Optional auth guard - attaches user if token present, but doesn't require it.
 * Use for routes that work for both guests and authenticated users.
 */
export function optionalAuthGuard(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    // No auth header - continue as guest
    return next();
  }

  const token = authHeader.replace('Bearer ', '').trim();

  try {
    const payload = verifyJwt<{
      sub: string;
      email?: string;
      phone?: string;
      roles?: string[];
      type?: 'waiver_user';
    }>(token);
    const userObj: AuthenticatedRequest['user'] = {
      id: payload.sub,
      email: payload.email ?? '',
      roles: payload.roles ?? [],
      type: payload.type === 'waiver_user' ? 'waiver_user' : 'user',
    };
    if (payload.phone) userObj.phone = payload.phone;
    (req as AuthenticatedRequest).user = userObj;
  } catch {
    // Invalid token - continue as guest
  }
  return next();
}

export function requireRoles(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authRequest = req as AuthenticatedRequest;
    const userRoles = authRequest.user?.roles ?? [];

    const hasRole = allowedRoles.some(role => userRoles.includes(role));
    if (!hasRole) {
      return next(new AppError('Forbidden', 403));
    }

    return next();
  };
}

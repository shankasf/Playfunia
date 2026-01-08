import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { appConfig } from '../config/env';
import { AppError } from '../utils/app-error';
import { UserRepository } from '../repositories';

export interface SupabaseAuthenticatedRequest extends Request {
  user?: {
    id: string;           // public.users.user_id (integer as string)
    authUserId: string;   // auth.users.id (UUID)
    email: string;
    roles: string[];
    type?: 'user' | 'waiver_user';
    phone?: string;
  };
}

interface SupabaseJWTPayload {
  sub: string;          // auth.users.id (UUID)
  email?: string;
  phone?: string;
  role: string;         // Supabase role (authenticated, anon)
  aud: string;
  exp: number;
  iat: number;
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
  user_metadata?: {
    first_name?: string;
    last_name?: string;
  };
}

/**
 * Supabase Auth Guard - Verifies Supabase JWT tokens and attaches user to request.
 * Looks up user in public.users by auth_user_id (UUID from Supabase).
 */
export async function supabaseAuthGuard(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Unauthorized', 401));
  }

  const token = authHeader.replace('Bearer ', '').trim();

  try {
    // Verify the Supabase JWT
    const jwtSecret = appConfig.supabaseJwtSecret;
    if (!jwtSecret) {
      console.error('SUPABASE_JWT_SECRET not configured');
      return next(new AppError('Authentication not configured', 500));
    }

    const payload = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'],
    }) as SupabaseJWTPayload;

    // Check if it's a valid authenticated session
    if (payload.role !== 'authenticated') {
      return next(new AppError('Invalid authentication', 401));
    }

    // Look up the user in public.users by auth_user_id
    let user = await UserRepository.findByAuthUserId(payload.sub);

    if (!user) {
      // User authenticated with Supabase but not yet in public.users
      // Try to find by email as fallback (for migrated users)
      if (payload.email) {
        const userByEmail = await UserRepository.findByEmail(payload.email);

        if (userByEmail) {
          // Link the existing user to Supabase auth
          await UserRepository.update(userByEmail.user_id, {
            auth_user_id: payload.sub
          });
          user = userByEmail;
        } else {
          // Create new user record from Supabase auth
          user = await UserRepository.createFromSupabaseAuth({
            id: payload.sub,
            email: payload.email,
            user_metadata: payload.user_metadata,
          });
        }
      } else {
        return next(new AppError('User not found', 401));
      }
    }

    (req as SupabaseAuthenticatedRequest).user = {
      id: String(user.user_id),
      authUserId: payload.sub,
      email: user.email,
      roles: user.roles ?? ['user'],
      type: 'user',
      phone: user.phone ?? undefined,
    };

    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Token expired', 401));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid token', 401));
    }
    console.error('Supabase auth error:', error);
    return next(new AppError('Authentication failed', 401, { cause: error }));
  }
}

/**
 * Optional Supabase Auth Guard - Attaches user if valid token present, but doesn't require it.
 * Use for routes that work for both guests and authenticated users.
 */
export async function optionalSupabaseAuthGuard(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    // No auth header - continue as guest
    return next();
  }

  // Try to authenticate, but don't fail if it doesn't work
  try {
    await new Promise<void>((resolve, reject) => {
      supabaseAuthGuard(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch {
    // Invalid token - continue as guest
  }
  return next();
}

/**
 * Waiver Auth Guard for Supabase - Accepts both regular users and waiver-only users.
 * Use this for waiver routes that should work for both user types.
 */
export async function supabaseWaiverAuthGuard(req: Request, res: Response, next: NextFunction) {
  // For waiver auth, we still support both Supabase JWT and legacy waiver tokens
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Unauthorized', 401));
  }

  const token = authHeader.replace('Bearer ', '').trim();

  // First try Supabase JWT verification
  try {
    const jwtSecret = appConfig.supabaseJwtSecret;
    if (jwtSecret) {
      const payload = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256'],
      }) as SupabaseJWTPayload;

      if (payload.role === 'authenticated') {
        // Valid Supabase token - look up user
        const user = await UserRepository.findByAuthUserId(payload.sub);
        if (user) {
          (req as SupabaseAuthenticatedRequest).user = {
            id: String(user.user_id),
            authUserId: payload.sub,
            email: user.email,
            roles: user.roles ?? ['user'],
            type: 'user',
            phone: user.phone ?? undefined,
          };
          return next();
        }
      }
    }
  } catch {
    // Not a valid Supabase token, try legacy JWT
  }

  // Fallback to legacy JWT for waiver tokens
  try {
    const legacySecret = appConfig.jwtSecret;
    if (legacySecret) {
      const payload = jwt.verify(token, legacySecret, {
        algorithms: ['HS256'],
      }) as {
        sub: string;
        email?: string;
        phone?: string;
        roles?: string[];
        type?: 'waiver_user';
      };

      (req as SupabaseAuthenticatedRequest).user = {
        id: payload.sub,
        authUserId: payload.sub,
        email: payload.email ?? '',
        roles: payload.roles ?? [],
        type: payload.type === 'waiver_user' ? 'waiver_user' : 'user',
        phone: payload.phone,
      };
      return next();
    }
  } catch {
    // Neither token type worked
  }

  return next(new AppError('Invalid or expired token', 401));
}

/**
 * Role-based authorization middleware.
 * Use after supabaseAuthGuard to restrict access to specific roles.
 */
export function requireRoles(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authRequest = req as SupabaseAuthenticatedRequest;
    const userRoles = authRequest.user?.roles ?? [];

    const hasRole = allowedRoles.some(role => userRoles.includes(role));
    if (!hasRole) {
      return next(new AppError('Forbidden', 403));
    }

    return next();
  };
}

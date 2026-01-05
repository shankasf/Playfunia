import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { waiverAuthLookupSchema, waiverAuthLoginSchema } from '../schemas/waiver-auth.schema';
import { lookupWaiverAuth, loginOrRegisterWaiverUser } from '../services/waiver-auth.service';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';

function parseWithSchema<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues.map((issue) => issue.message).join(', ');
      throw new AppError(`Validation failed: ${message}`, 400, { cause: error });
    }
    throw error;
  }
}

/**
 * POST /waiver-auth/lookup
 * Check if email/phone exists in main User or WaiverUser DB
 */
export const lookupHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parseWithSchema(waiverAuthLookupSchema, req.body);
  const result = await lookupWaiverAuth(input);
  return res.status(200).json(result);
});

/**
 * POST /waiver-auth/login
 * Login existing waiver user or register new one (no password)
 */
export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = parseWithSchema(waiverAuthLoginSchema, req.body);
  const result = await loginOrRegisterWaiverUser(input);
  return res.status(200).json(result);
});

import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { loginSchema, registerSchema } from '../schemas/auth.schema';
import { loginUser, registerUser } from '../services/auth.service';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';

export const registerHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = parseWithSchema(registerSchema, req.body);
  const result = await registerUser(parsed);
  return res.status(201).json(result);
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = parseWithSchema(loginSchema, req.body);
  const result = await loginUser(parsed);
  return res.status(200).json(result);
});

function parseWithSchema<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues.map(issue => issue.message).join(', ');
      throw new AppError(`Validation failed: ${message}`, 400, { cause: error });
    }
    throw error;
  }
}

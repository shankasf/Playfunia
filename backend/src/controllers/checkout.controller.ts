import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { 
  createCheckoutPaymentIntent, 
  finalizeCheckout,
  createGuestCheckoutPaymentIntent,
  finalizeGuestCheckout
} from '../services/checkout.service';
import { 
  checkoutIntentSchema, 
  checkoutFinalizeSchema,
  guestCheckoutIntentSchema,
  guestCheckoutFinalizeSchema
} from '../schemas/checkout.schema';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';

export const createCheckoutIntentHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    const payload = parseWithSchema(checkoutIntentSchema, req.body);
    const intent = await createCheckoutPaymentIntent(req.user.id, payload);
    return res.status(200).json(intent);
  },
);

export const finalizeCheckoutHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    const payload = parseWithSchema(checkoutFinalizeSchema, req.body);
    const result = await finalizeCheckout(req.user.id, payload);
    return res.status(200).json(result);
  },
);

// Guest checkout handlers
export const createGuestCheckoutIntentHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = parseWithSchema(guestCheckoutIntentSchema, req.body);
    const intent = await createGuestCheckoutPaymentIntent(payload);
    return res.status(200).json(intent);
  },
);

export const finalizeGuestCheckoutHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = parseWithSchema(guestCheckoutFinalizeSchema, req.body);
    const result = await finalizeGuestCheckout(payload);
    return res.status(200).json(result);
  },
);

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

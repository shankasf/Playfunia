import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  getSquareAppId,
  getSquareLocation
} from '../services/square-payment.service';
import {
  createSquareCheckoutPaymentIntent,
  finalizeSquareCheckout,
  createSquareGuestCheckoutPaymentIntent,
  finalizeSquareGuestCheckout,
} from '../services/square-checkout.service';
import {
  squareCheckoutIntentSchema,
  squareCheckoutFinalizeSchema,
  squareGuestCheckoutIntentSchema,
  squareGuestCheckoutFinalizeSchema,
} from '../schemas/square-checkout.schema';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';
import { appConfig } from '../config/env';

export const getSquareConfigHandler = asyncHandler(
  async (_req: Request, res: Response) => {
    // Return Square application ID and location ID for Web Payments SDK
    const config = {
      applicationId: appConfig.squareApplicationId ?? null,
      locationId: appConfig.squareLocationId ?? null,
      environment: appConfig.squareEnvironment,
      available: Boolean(appConfig.squareApplicationId && appConfig.squareLocationId),
    };

    return res.status(200).json(config);
  },
);

export const createSquareCheckoutIntentHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    const payload = parseWithSchema(squareCheckoutIntentSchema, req.body);
    const intent = await createSquareCheckoutPaymentIntent(req.user.id, payload);
    return res.status(200).json(intent);
  },
);

export const finalizeSquareCheckoutHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    const payload = parseWithSchema(squareCheckoutFinalizeSchema, req.body);
    const result = await finalizeSquareCheckout(req.user.id, payload);
    return res.status(200).json(result);
  },
);

// Guest checkout handlers
export const createSquareGuestCheckoutIntentHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = parseWithSchema(squareGuestCheckoutIntentSchema, req.body);
    const intent = await createSquareGuestCheckoutPaymentIntent(payload);
    return res.status(200).json(intent);
  },
);

export const finalizeSquareGuestCheckoutHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = parseWithSchema(squareGuestCheckoutFinalizeSchema, req.body);
    const result = await finalizeSquareGuestCheckout(payload);
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

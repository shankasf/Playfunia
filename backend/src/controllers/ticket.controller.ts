import type { Response } from "express";
import { ZodError } from "zod";

import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import { redeemTicket, reserveTickets, listTicketsForGuardian, listAllTickets } from "../services/ticket.service";
import { redeemTicketSchema, reserveTicketsSchema } from "../schemas/ticket.schema";
import { AppError } from "../utils/app-error";
import { asyncHandler } from "../utils/async-handler";

export const reserveTicketsHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const payload = parseWithSchema(reserveTicketsSchema, {
    ...req.body,
    guardianId: req.user.id,
  });
  const ticket = await reserveTickets(payload);
  return res.status(201).json({ ticket });
});

export const listTicketsHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError("Unauthorized", 401);
  }

  const tickets = await listTicketsForGuardian(req.user.id);
  return res.status(200).json({ tickets });
});

export const redeemTicketHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const payload = parseWithSchema(redeemTicketSchema, req.body);
  const updated = await redeemTicket(payload);
  return res.status(200).json({ ticket: updated });
});

export const listAllTicketsHandler = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const tickets = await listAllTickets();
    return res.status(200).json({ tickets });
  },
);

function parseWithSchema<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues.map(issue => issue.message).join(", ");
      throw new AppError(`Validation failed: ${message}`, 400, { cause: error });
    }
    throw error;
  }
}

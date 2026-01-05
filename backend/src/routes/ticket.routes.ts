import { Router } from "express";

import {
  redeemTicketHandler,
  reserveTicketsHandler,
  listTicketsHandler,
  listAllTicketsHandler,
} from "../controllers/ticket.controller";
import { authGuard, requireRoles } from "../middleware/auth.middleware";

export const ticketRouter = Router();

ticketRouter.use(authGuard);
ticketRouter.post("/reserve", reserveTicketsHandler);
ticketRouter.get("/", listTicketsHandler);
ticketRouter.get("/admin", requireRoles("admin", "staff"), listAllTicketsHandler);
ticketRouter.post("/redeem", requireRoles("admin", "staff"), redeemTicketHandler);

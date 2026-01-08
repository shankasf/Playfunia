import { Router } from "express";

import {
  redeemTicketHandler,
  reserveTicketsHandler,
  listTicketsHandler,
  listAllTicketsHandler,
} from "../controllers/ticket.controller";
import { supabaseAuthGuard, requireRoles } from "../middleware/supabase-auth.middleware";

export const ticketRouter = Router();

ticketRouter.use(supabaseAuthGuard);
ticketRouter.post("/reserve", reserveTicketsHandler);
ticketRouter.get("/", listTicketsHandler);
ticketRouter.get("/admin", requireRoles("admin", "staff"), listAllTicketsHandler);
ticketRouter.post("/redeem", requireRoles("admin", "staff"), redeemTicketHandler);

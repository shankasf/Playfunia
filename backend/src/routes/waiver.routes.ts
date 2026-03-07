import { Router } from "express";
import rateLimit from "express-rate-limit";

import { exportWaiversHandler, listWaiversHandler, signWaiverHandler } from "../controllers/waiver.controller";
import { supabaseAuthGuard, supabaseWaiverAuthGuard, requireRoles } from "../middleware/supabase-auth.middleware";

export const waiverRouter = Router();

const waiverSignLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many waiver submissions. Please try again later." },
});

// These routes accept both regular users and waiver-only users
waiverRouter.post("/", waiverSignLimiter, supabaseWaiverAuthGuard, signWaiverHandler);
waiverRouter.get("/", supabaseWaiverAuthGuard, listWaiversHandler);

// Admin export requires full auth
waiverRouter.get("/export", supabaseAuthGuard, requireRoles("admin", "staff"), exportWaiversHandler);
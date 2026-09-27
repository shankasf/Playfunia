import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import { exportWaiversHandler, listWaiversHandler, signWaiverHandler } from "../controllers/waiver.controller";
import {
  supabaseAuthGuard,
  supabaseWaiverAuthGuard,
  requireRoles,
  type SupabaseAuthenticatedRequest,
} from "../middleware/supabase-auth.middleware";

export const waiverRouter = Router();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const tooManySubmissions = { error: "Too many waiver submissions. Please try again later." };

// Per network: a generous ceiling so the front-desk kiosk and shared store Wi-Fi
// can sign a rush of families from one IP.
const waiverSignIpLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManySubmissions,
});

// Per waiver account: the real abuse guard (one family re-submitting over and over).
// Runs after the auth guard so it can key on the token's identity.
const waiverSignAccountLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManySubmissions,
  keyGenerator: (req) => {
    const user = (req as SupabaseAuthenticatedRequest).user;
    // New waiver users hold a "pending" token until their first submission
    const identity = user?.id === "pending" ? user.email || user.phone : user?.id;
    return identity ? `waiver-account:${identity}` : `waiver-ip:${ipKeyGenerator(req.ip ?? "")}`;
  },
});

// These routes accept both regular users and waiver-only users
waiverRouter.post("/", waiverSignIpLimiter, supabaseWaiverAuthGuard, waiverSignAccountLimiter, signWaiverHandler);
waiverRouter.get("/", supabaseWaiverAuthGuard, listWaiversHandler);

// Admin export requires full auth
waiverRouter.get("/export", supabaseAuthGuard, requireRoles("admin", "staff"), exportWaiversHandler);

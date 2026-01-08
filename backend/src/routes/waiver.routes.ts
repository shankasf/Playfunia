import { Router } from "express";

import { exportWaiversHandler, listWaiversHandler, signWaiverHandler } from "../controllers/waiver.controller";
import { supabaseAuthGuard, supabaseWaiverAuthGuard, requireRoles } from "../middleware/supabase-auth.middleware";

export const waiverRouter = Router();

// These routes accept both regular users and waiver-only users
waiverRouter.post("/", supabaseWaiverAuthGuard, signWaiverHandler);
waiverRouter.get("/", supabaseWaiverAuthGuard, listWaiversHandler);

// Admin export requires full auth
waiverRouter.get("/export", supabaseAuthGuard, requireRoles("admin", "staff"), exportWaiversHandler);
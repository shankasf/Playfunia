import { Router } from "express";

import { exportWaiversHandler, listWaiversHandler, signWaiverHandler } from "../controllers/waiver.controller";
import { authGuard, requireRoles, waiverAuthGuard } from "../middleware/auth.middleware";

export const waiverRouter = Router();

// These routes accept both regular users and waiver-only users
waiverRouter.post("/", waiverAuthGuard, signWaiverHandler);
waiverRouter.get("/", waiverAuthGuard, listWaiversHandler);

// Admin export requires full auth
waiverRouter.get("/export", authGuard, requireRoles("admin", "staff"), exportWaiversHandler);
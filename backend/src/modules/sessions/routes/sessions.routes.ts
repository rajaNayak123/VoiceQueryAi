import { Router } from "express";
import { sessionsController } from "../controller/sessions.controller";
import { requireAuth } from "../../../middleware/auth";

const router = Router();

router.post("/", requireAuth, sessionsController.create);

export default router;

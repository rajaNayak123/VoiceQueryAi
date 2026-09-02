import { Router } from "express";
import { sessionsController } from "../controller/sessions.controller";

const router = Router();

router.post("/", sessionsController.create);

export default router;

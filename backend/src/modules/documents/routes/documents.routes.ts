import { Router } from "express";
import { documentsController } from "../controller/documents.controller";
import { uploadPdf } from "../../../middleware/upload";
import { uploadRateLimiter } from "../../../middleware/rateLimiter";
import { requireAuth } from "../../../middleware/auth";

const router = Router();

router.post(
  "/upload",
  requireAuth,
  uploadRateLimiter,
  uploadPdf.any(),
  documentsController.upload
);
router.get("/:id/status", requireAuth, documentsController.status);
router.get("/:id/file", requireAuth, documentsController.getFile);
router.delete("/:id", requireAuth, documentsController.remove);
router.get("/", requireAuth, documentsController.list);

export default router;

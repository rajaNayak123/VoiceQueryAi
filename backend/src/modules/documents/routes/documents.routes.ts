import { Router } from "express";
import { documentsController } from "../controller/documents.controller";
import { uploadPdf } from "../../../middleware/upload";
import { uploadRateLimiter } from "../../../middleware/rateLimiter";

const router = Router();

router.post(
  "/upload",
  uploadRateLimiter,
  uploadPdf.single("file"),
  documentsController.upload
);
router.get("/:id/status", documentsController.status);
router.get("/:id/file", documentsController.getFile);
router.delete("/:id", documentsController.remove);

export default router;

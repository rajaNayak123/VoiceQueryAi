import { Request, Response, NextFunction } from "express";
import { AppError } from "../../../middleware/errorHandler";
import { documentsService } from "../service/documents.service";

export const documentsController = {
  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      let files: Express.Multer.File[] = [];
      if (req.file) {
        files = [req.file];
      } else if (Array.isArray(req.files)) {
        files = req.files;
      } else if (req.files && typeof req.files === "object") {
        files = Object.values(req.files).flat();
      }

      if (files.length === 0) {
        throw new AppError(400, "No file uploaded (field name: 'file' or 'files').");
      }

      const userId = (req as any).auth?.userId;
      if (files.length === 1) {
        const result = await documentsService.handleUpload(files[0], userId);
        res.status(202).json({
          documentId: result.documentId,
          status: result.status,
          documents: [
            {
              documentId: result.documentId,
              filename: files[0].originalname,
              status: result.status,
            },
          ],
        });
      } else {
        const result = await documentsService.handleBatchUpload(files, userId);
        res.status(202).json(result);
      }
    } catch (err) {
      next(err);
    }
  },

  async status(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).auth?.userId;
      const document = await documentsService.getStatus(req.params.id, userId);
      res.json({
        id: document.id,
        filename: document.filename,
        status: document.status,
        pageCount: document.pageCount,
        failureReason: document.failureReason,
      });
    } catch (err) {
      next(err);
    }
  },

  async getFile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).auth?.userId;
      const { filePath, filename } = await documentsService.getFilePath(
        req.params.id,
        userId
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(filename)}"`
      );
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).auth?.userId;
      await documentsService.deleteDocument(req.params.id, userId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).auth?.userId;
      const docs = await documentsService.listUserDocuments(userId);
      res.json(docs);
    } catch (err) {
      next(err);
    }
  },
};

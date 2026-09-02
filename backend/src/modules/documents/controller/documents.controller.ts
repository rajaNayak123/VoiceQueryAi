import { Request, Response, NextFunction } from "express";
import { AppError } from "../../../middleware/errorHandler";
import { documentsService } from "../service/documents.service";

export const documentsController = {
  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError(400, "No file uploaded (field name: 'file').");
      }
      const result = await documentsService.handleUpload(req.file);
      res.status(202).json({
        documentId: result.documentId,
        status: result.status, 
      });
    } catch (err) {
      next(err);
    }
  },

  async status(req: Request, res: Response, next: NextFunction) {
    try {
      const document = await documentsService.getStatus(req.params.id);
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

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await documentsService.deleteDocument(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};

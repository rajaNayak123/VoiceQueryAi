import { Request, Response, NextFunction } from "express";
import { AppError } from "../../../middleware/errorHandler";
import { sessionsService } from "../service/sessions.service";

export const sessionsController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { documentId } = req.body as { documentId?: string };
      if (!documentId) {
        throw new AppError(400, "documentId is required");
      }
      const result = await sessionsService.createSession(documentId);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
};

import { Request, Response, NextFunction } from "express";
import { AppError } from "../../../middleware/errorHandler";
import { sessionsService } from "../service/sessions.service";

export const sessionsController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { documentId, documentIds } = req.body as {
        documentId?: string;
        documentIds?: string[];
      };
      const ids =
        documentIds && Array.isArray(documentIds) && documentIds.length > 0
          ? documentIds
          : documentId
          ? [documentId]
          : [];

      if (ids.length === 0) {
        throw new AppError(400, "documentId or documentIds array is required");
      }

      const userId = (req as any).auth?.userId;
      const result = await sessionsService.createSession(
        { documentIds: ids, userId },
        userId
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
};

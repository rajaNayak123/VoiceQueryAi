// Converts thrown errors (including validation/multer errors) into JSON 4xx/5xx responses.
import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { logger } from "../utils/logger";

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }

  if (err instanceof Error && err.message === "ONLY_PDF_ALLOWED") {
    return res.status(400).json({ error: "Only PDF files are accepted." });
  }

  logger.error({ err }, "Unhandled error");
  return res.status(500).json({ error: "Internal server error" });
}

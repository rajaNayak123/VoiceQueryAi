import express from "express";
import cors from "cors";
import { clerkMiddleware } from "./middleware/auth.js";
import documentsRoutes from "./modules/documents/routes/documents.routes.js";
import sessionsRoutes from "./modules/sessions/routes/sessions.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use((req, _res, next) => {
    if (!req.headers.authorization && typeof req.query.token === "string") {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
    next();
  });

  app.use(clerkMiddleware());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/documents", documentsRoutes);
  app.use("/api/sessions", sessionsRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(errorHandler);

  return app;
}

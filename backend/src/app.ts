// Express app setup, route mounting.
import express from "express";
import cors from "cors";
import documentsRoutes from "./modules/documents/routes/documents.routes.js";
import sessionsRoutes from "./modules/sessions/routes/sessions.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

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

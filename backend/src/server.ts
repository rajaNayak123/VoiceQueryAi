// Entrypoint: starts the HTTP and WebSocket servers.
import http from "http";
import { env } from "./config/env";
import { createApp } from "./app";
import { initDocumentWebSocketServer } from "./services/websocket/documentSocket";
import "./services/queue/documentQueue"; // initialize BullMQ queue worker
import { logger } from "./utils/logger";

const app = createApp();
const server = http.createServer(app);

// Mount WebSockets on /ws/documents
initDocumentWebSocketServer(server);

server.listen(env.PORT, () => {
  logger.info(`Backend listening on http://localhost:${env.PORT}`);
  logger.info(`Document WebSockets active on ws://localhost:${env.PORT}/ws/documents`);
});


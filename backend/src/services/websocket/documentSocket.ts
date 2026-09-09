import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { prisma } from "../../config/db";
import { logger } from "../../utils/logger";

interface DocumentStatusPayload {
  status: "uploading" | "processing" | "ready" | "failed";
  pageCount?: number | null;
  failureReason?: string | null;
  filename?: string;
}

// Map documentId -> Set of connected WebSocket clients
const documentSubscriptions = new Map<string, Set<WebSocket>>();

let wssInstance: WebSocketServer | null = null;

export function initDocumentWebSocketServer(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
  });

  wssInstance = wss;

  server.on("upgrade", (request, socket, head) => {
    try {
      const url = new URL(request.url ?? "", `http://${request.headers.host ?? "localhost"}`);
      if (url.pathname === "/ws/documents") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      }
    } catch (err) {
      logger.warn({ err }, "WebSocket upgrade failed");
      socket.destroy();
    }
  });

  wss.on("connection", async (ws: WebSocket, req) => {
    let currentDocumentId: string | null = null;

    try {
      const url = new URL(req.url ?? "", `http://${req.headers.host ?? "localhost"}`);
      const docIdParam = url.searchParams.get("documentId");
      if (docIdParam) {
        currentDocumentId = docIdParam;
        subscribeClient(currentDocumentId, ws);
        // Immediately send current status from DB
        await sendCurrentStatus(currentDocumentId, ws);
      }
    } catch (err) {
      logger.warn({ err }, "Error reading documentId from WebSocket query");
    }

    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString()) as {
          type?: string;
          documentId?: string;
        };

        if (message.type === "subscribe" && message.documentId) {
          if (currentDocumentId && currentDocumentId !== message.documentId) {
            unsubscribeClient(currentDocumentId, ws);
          }
          currentDocumentId = message.documentId;
          subscribeClient(currentDocumentId, ws);
          await sendCurrentStatus(currentDocumentId, ws);
        } else if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        }
      } catch (err) {
        logger.debug({ err }, "Invalid WebSocket client message");
      }
    });

    ws.on("close", () => {
      if (currentDocumentId) {
        unsubscribeClient(currentDocumentId, ws);
      }
    });

    ws.on("error", (err) => {
      logger.debug({ err, currentDocumentId }, "WebSocket client error");
      if (currentDocumentId) {
        unsubscribeClient(currentDocumentId, ws);
      }
    });
  });

  // Heartbeat ping interval to keep connections alive
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  logger.info("Document WebSocket server mounted on /ws/documents");
  return wss;
}

function subscribeClient(documentId: string, ws: WebSocket) {
  if (!documentSubscriptions.has(documentId)) {
    documentSubscriptions.set(documentId, new Set());
  }
  documentSubscriptions.get(documentId)!.add(ws);
}

function unsubscribeClient(documentId: string, ws: WebSocket) {
  const subs = documentSubscriptions.get(documentId);
  if (subs) {
    subs.delete(ws);
    if (subs.size === 0) {
      documentSubscriptions.delete(documentId);
    }
  }
}

async function sendCurrentStatus(documentId: string, ws: WebSocket) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
    });
    if (doc) {
      ws.send(
        JSON.stringify({
          type: "document_status",
          documentId: doc.id,
          filename: doc.filename,
          status: doc.status,
          pageCount: doc.pageCount,
          failureReason: doc.failureReason,
        })
      );
    }
  } catch (err) {
    logger.debug({ err, documentId }, "Could not fetch document status for WebSocket");
  }
}

export function broadcastDocumentStatus(
  documentId: string,
  payload: DocumentStatusPayload
): void {
  const subscribers = documentSubscriptions.get(documentId);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  const message = JSON.stringify({
    type: "document_status",
    documentId,
    ...payload,
  });

  for (const client of subscribers) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (err) {
        logger.warn({ err, documentId }, "Failed to send WebSocket status message");
      }
    }
  }
}

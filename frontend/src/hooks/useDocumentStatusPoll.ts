import { useEffect, useRef, useState } from "react";
import { getStatus, getDocumentWebSocketUrl } from "../api/client";
import type { DocumentStatus, DocumentStatusResponse } from "../types";

export function useDocumentStatusPoll(documentId: string | null) {
  const [status, setStatus] = useState<DocumentStatus | null>(null);
  const [document, setDocument] = useState<DocumentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!documentId) {
      setStatus(null);
      setDocument(null);
      setError(null);
      return;
    }

    let isDisposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    // 1. Fast initial status fetch
    getStatus(documentId)
      .then((res) => {
        if (isDisposed) return;
        setDocument(res);
        setStatus(res.status);
      })
      .catch(() => {
        // Safe to ignore initial check error while processing begins
      });

    // 2. Real-time WebSocket connection for instant event updates
    function connectWs() {
      if (isDisposed) return;

      try {
        const wsUrl = getDocumentWebSocketUrl(documentId!);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: "subscribe",
              documentId,
            })
          );
        };

        ws.onmessage = (event) => {
          if (isDisposed) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === "document_status" && data.documentId === documentId) {
              setStatus(data.status);
              setDocument((prev) => ({
                id: data.documentId,
                filename: data.filename ?? prev?.filename ?? "document.pdf",
                status: data.status,
                pageCount: data.pageCount ?? prev?.pageCount ?? null,
                failureReason: data.failureReason ?? prev?.failureReason ?? null,
              }));

              if (data.status === "ready" || data.status === "failed") {
                ws.close(1000, "Processing complete");
              }
            }
          } catch {
            // Ignore malformed packet
          }
        };

        ws.onerror = () => {
          // Handled gracefully in onclose
        };

        ws.onclose = (event) => {
          if (isDisposed) return;
          // If closed abnormally and not terminal state, attempt auto-reconnect
          if (event.code !== 1000) {
            reconnectTimer = setTimeout(() => {
              connectWs();
            }, 2000);
          }
        };
      } catch (err) {
        if (!isDisposed) {
          setError(err instanceof Error ? err.message : "WebSocket connection failed");
        }
      }
    }

    connectWs();

    return () => {
      isDisposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close(1000, "Hook unmounted");
        wsRef.current = null;
      }
    };
  }, [documentId]);

  return { status, document, error };
}


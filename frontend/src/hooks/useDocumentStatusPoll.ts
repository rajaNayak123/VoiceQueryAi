import { useEffect, useState } from "react";
import { getStatus } from "../api/client";
import type { DocumentStatus, DocumentStatusResponse } from "../types";

const POLL_INTERVAL_MS = 1500;

export function useDocumentStatusPoll(documentId: string | null) {
  const [status, setStatus] = useState<DocumentStatus | null>(null);
  const [document, setDocument] = useState<DocumentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const result = await getStatus(documentId!);
        if (cancelled) return;
        setDocument(result);
        setStatus(result.status);

        if (result.status === "ready" || result.status === "failed") {
          return; // stop polling
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Status check failed");
      }
    }

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [documentId]);

  return { status, document, error };
}

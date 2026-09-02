import { useState } from "react";
import { UploadDropzone } from "../components/upload/UploadDropzone";
import { ProcessingStatus } from "../components/upload/ProcessingStatus";
import { Button } from "../components/common/Button";
import { useDocumentUpload } from "../hooks/useDocumentUpload";
import { useDocumentStatusPoll } from "../hooks/useDocumentStatusPoll";
import { createSession } from "../api/client";

interface UploadPageProps {
  onSessionReady: (params: { token: string; livekitUrl: string }) => void;
}

export function UploadPage({ onSessionReady }: UploadPageProps) {
  const { upload, uploading, error: uploadError } = useDocumentUpload();
  const [documentId, setDocumentId] = useState<string | null>(null);
  const { status, document, error: statusError } =
    useDocumentStatusPoll(documentId);
  const [starting, setStarting] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  async function handleFileSelected(file: File) {
    const id = await upload(file);
    if (id) setDocumentId(id);
  }

  async function handleStartCall() {
    if (!documentId) return;
    setStarting(true);
    setSessionError(null);
    try {
      const session = await createSession(documentId);
      onSessionReady({ token: session.token, livekitUrl: session.livekitUrl });
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "Could not start call");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "60px auto", fontFamily: "sans-serif" }}>
      <h1 style={{ marginBottom: 24 }}>PDF Voice RAG Agent</h1>

      {!documentId && (
        <UploadDropzone onFileSelected={handleFileSelected} disabled={uploading} />
      )}

      {uploadError && <p style={{ color: "#dc2626" }}>{uploadError}</p>}

      {documentId && status && (
        <div style={{ marginTop: 24 }}>
          <ProcessingStatus status={status} failureReason={document?.failureReason} />
        </div>
      )}

      {statusError && <p style={{ color: "#dc2626" }}>{statusError}</p>}
      {sessionError && <p style={{ color: "#dc2626" }}>{sessionError}</p>}

      {status === "ready" && (
        <div style={{ marginTop: 24 }}>
          <Button onClick={handleStartCall} disabled={starting}>
            {starting ? "Starting call..." : "Start voice conversation"}
          </Button>
        </div>
      )}
    </div>
  );
}

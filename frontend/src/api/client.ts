// Fetch wrappers for the backend API.
import type {
  CreateSessionResponse,
  DocumentStatusResponse,
  UploadResponse,
} from "../types";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadDocument(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/documents/upload`, {
    method: "POST",
    body: formData,
  });

  return handleResponse<UploadResponse>(res);
}

export async function getStatus(
  documentId: string
): Promise<DocumentStatusResponse> {
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}/status`);
  return handleResponse<DocumentStatusResponse>(res);
}

export async function createSession(
  documentId: string
): Promise<CreateSessionResponse> {
  const res = await fetch(`${API_BASE_URL}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId }),
  });
  return handleResponse<CreateSessionResponse>(res);
}

export function getDocumentPdfUrl(documentId: string): string {
  return `${API_BASE_URL}/api/documents/${documentId}/file`;
}

export function getDocumentWebSocketUrl(documentId: string): string {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  return `${wsBase}/ws/documents?documentId=${encodeURIComponent(documentId)}`;
}



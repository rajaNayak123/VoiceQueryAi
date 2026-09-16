import type {
  CreateSessionResponse,
  DocumentStatusResponse,
  UploadResponse,
  BatchUploadResponse,
} from "../types";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

let tokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthTokenGetter(fn: () => Promise<string | null>) {
  tokenGetter = fn;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!tokenGetter) return {};
  try {
    const token = await tokenGetter();
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
  } catch {
    // Ignore token acquisition error
  }
  return {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? body.message ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadDocument(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const authHeaders = await getAuthHeaders();

  const res = await fetch(`${API_BASE_URL}/api/documents/upload`, {
    method: "POST",
    headers: {
      ...authHeaders,
    },
    body: formData,
  });

  return handleResponse<UploadResponse>(res);
}

export async function uploadDocuments(files: File[]): Promise<BatchUploadResponse> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });

  const authHeaders = await getAuthHeaders();

  const res = await fetch(`${API_BASE_URL}/api/documents/upload`, {
    method: "POST",
    headers: {
      ...authHeaders,
    },
    body: formData,
  });

  return handleResponse<BatchUploadResponse>(res);
}

export async function getStatus(
  documentId: string
): Promise<DocumentStatusResponse> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}/status`, {
    headers: {
      ...authHeaders,
    },
  });
  return handleResponse<DocumentStatusResponse>(res);
}

export async function createSession(
  target: string | string[]
): Promise<CreateSessionResponse> {
  const authHeaders = await getAuthHeaders();
  const payload = Array.isArray(target)
    ? { documentIds: target }
    : { documentId: target };

  const res = await fetch(`${API_BASE_URL}/api/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(payload),
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

export interface DocumentItem {
  id: string;
  filename: string;
  status: "uploading" | "processing" | "ready" | "failed";
  pageCount?: number;
  failureReason?: string;
  createdAt: string;
}

export async function listDocuments(): Promise<DocumentItem[]> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/api/documents`, {
    headers: {
      ...authHeaders,
    },
  });
  return handleResponse<DocumentItem[]>(res);
}

export async function deleteDocument(documentId: string): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE_URL}/api/documents/${documentId}`, {
    method: "DELETE",
    headers: {
      ...authHeaders,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to delete document (${res.status})`);
  }
}



export type DocumentStatus = "uploading" | "processing" | "ready" | "failed";

export interface DocumentStatusResponse {
  id: string;
  filename: string;
  status: DocumentStatus;
  pageCount: number | null;
  failureReason: string | null;
}

export interface UploadResponse {
  documentId: string;
  status: DocumentStatus;
}

export interface CreateSessionResponse {
  token: string;
  roomName: string;
  livekitUrl: string;
}

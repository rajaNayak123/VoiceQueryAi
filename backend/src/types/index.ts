export interface DocumentDTO {
  id: string;
  filename: string;
  status: "uploading" | "processing" | "ready" | "failed";
  qdrantCollection: string | null;
  pageCount: number | null;
  failureReason: string | null;
  createdAt: Date;
}

export interface SessionDTO {
  id: string;
  documentId: string;
  roomName: string;
  createdAt: Date;
}

export interface CreateSessionResponse {
  token: string;
  roomName: string;
  livekitUrl: string;
}

export interface ChunkWithMetadata {
  text: string;
  page: number;
}

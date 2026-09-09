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
  documentId?: string;
  filename?: string;
}

export interface BoundingBox {
  pageIndex: number; // 0-based page index
  left: number;      // percentage (0-100)
  top: number;       // percentage (0-100)
  width: number;     // percentage (0-100)
  height: number;    // percentage (0-100)
}

export type ContentType = "text" | "table" | "diagram" | "heading";

export interface ChunkWithMetadata {
  text: string;
  page: number;
  bbox?: BoundingBox;
  boxes?: BoundingBox[];
  contentType?: ContentType;
  section?: string;
  caption?: string;
  metadata?: Record<string, unknown>;
}


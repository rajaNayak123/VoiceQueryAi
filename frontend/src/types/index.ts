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

export interface Citation {
  id: string;
  page: number;      // 1-based page number
  pageIndex: number; // 0-based page index
  snippet: string;
  bbox?: BoundingBox;
  boxes?: BoundingBox[];
  score?: number | null;
  active?: boolean;
}

export interface CitationPacket {
  type: "citations_retrieved" | "citation_highlight" | "agent_state" | "interruption";
  citations?: Citation[];
  agentSpeaking?: boolean;
  state?: string;
  documentId?: string;
}

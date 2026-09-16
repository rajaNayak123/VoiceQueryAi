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

export interface DocumentItemSummary {
  id: string;
  filename: string;
  status?: string;
}

export interface CreateSessionResponse {
  token: string;
  roomName: string;
  livekitUrl: string;
  documentId?: string;
  filename?: string;
  documentIds?: string[];
  documents?: DocumentItemSummary[];
  isComparison?: boolean;
}

export interface BatchUploadResponse {
  documents: {
    documentId: string;
    filename: string;
    status: DocumentStatus;
  }[];
  documentId?: string;
  status?: DocumentStatus;
}

export interface BoundingBox {
  pageIndex: number; // 0-based page index
  left: number;      // percentage (0-100)
  top: number;       // percentage (0-100)
  width: number;     // percentage (0-100)
  height: number;    // percentage (0-100)
}

export interface SpotlightPayload {
  page_number: number;
  pageIndex: number;
  coordinates?: BoundingBox;
  section?: string | null;
  snippet?: string;
  citationId?: string;
  agentSpeaking?: boolean;
  timestamp?: number;
  documentId?: string;
  documentTitle?: string;
}

export interface Citation {
  id: string;
  page: number;      // 1-based page number
  page_number?: number; // 1-based alias for clarity
  pageIndex: number; // 0-based page index
  snippet: string;
  bbox?: BoundingBox;
  boxes?: BoundingBox[];
  coordinates?: BoundingBox;
  score?: number | null;
  active?: boolean;
  contentType?: "text" | "table" | "diagram" | "heading";
  section?: string | null;
  caption?: string | null;
  documentId?: string;
  documentTitle?: string;
}

export interface TelemetryMetrics {
  query?: string;
  stt_latency_ms: number;
  retrieval_latency_ms: number;
  llm_ttft_ms: number;
  tts_playback_latency_ms: number;
  total_e2e_ms: number;
  is_cached: boolean;
  timestamp: number;
  document_id?: string;
  collection?: string;
}

export interface CitationPacket {
  type:
    | "citations_retrieved"
    | "citation_highlight"
    | "agent_state"
    | "interruption"
    | "query_telemetry"
    | "query_phase"
    | "pdf_spotlight";
  citations?: Citation[];
  spotlight?: SpotlightPayload | null;
  page_number?: number;
  coordinates?: BoundingBox;
  agentSpeaking?: boolean;
  state?: string;
  documentId?: string;
  documentTitle?: string;
  metrics?: TelemetryMetrics;
  phase?: "stt" | "retrieval" | "llm" | "tts" | "completed" | "idle";
  query?: string;
  is_cached?: boolean;
}

export interface TranscriptItem {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: Date;
  confidence?: number;
  latency?: TelemetryMetrics;
  citations?: Citation[];
  isFinal?: boolean;
}


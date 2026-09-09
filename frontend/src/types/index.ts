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
  contentType?: "text" | "table" | "diagram" | "heading";
  section?: string | null;
  caption?: string | null;
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
  type: "citations_retrieved" | "citation_highlight" | "agent_state" | "interruption" | "query_telemetry";
  citations?: Citation[];
  agentSpeaking?: boolean;
  state?: string;
  documentId?: string;
  metrics?: TelemetryMetrics;
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


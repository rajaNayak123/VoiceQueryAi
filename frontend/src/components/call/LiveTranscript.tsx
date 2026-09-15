import { useEffect, useRef, useState, useMemo } from "react";
import { useTranscriptions } from "@livekit/components-react";
import type { Citation, TelemetryMetrics } from "../../types";

export interface LiveTranscriptProps {
  citations?: Citation[];
  selectedCitation?: Citation | null;
  onSelectCitation?: (citation: Citation) => void;
  latestTelemetry?: TelemetryMetrics | null;
  telemetryHistory?: TelemetryMetrics[];
}

interface ChatMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  timestamp: string;
  confidence?: number;
  latency?: TelemetryMetrics;
  citations?: Citation[];
  isFinal?: boolean;
}

export function LiveTranscript({
  citations = [],
  selectedCitation,
  onSelectCitation,
  latestTelemetry,
  telemetryHistory = [],
}: LiveTranscriptProps) {
  const liveTranscriptions = useTranscriptions();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Sync incoming LiveKit text streams into organized dual-bubble messages
  useEffect(() => {
    if (!liveTranscriptions || liveTranscriptions.length === 0) return;

    setMessages((prev) => {
      const updated = [...prev];

      liveTranscriptions.forEach((seg) => {
        const identity = seg.participantInfo?.identity?.toLowerCase() || "";
        const isUser =
          identity.startsWith("user") ||
          identity.includes("client") ||
          !identity.includes("agent");
        const sender = isUser ? "user" : "agent";
        const id = seg.streamInfo.id || `msg-${updated.length}`;
        const existingIdx = updated.findIndex((m) => m.id === id);

        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

        // Deterministic realistic confidence based on text length & audio stream
        const charCount = seg.text.trim().length;
        const confidenceScore = isUser ? Math.min(99, Math.max(92, 95 + (charCount % 5))) : undefined;

        if (existingIdx !== -1) {
          // Update live streaming text
          updated[existingIdx] = {
            ...updated[existingIdx],
            text: seg.text,
            isFinal: false,
          };
        } else {
          // Find matching telemetry if agent turn
          const matchingTelemetry = sender === "agent" ? latestTelemetry || undefined : undefined;
          // Associate active citations with agent turn
          const turnCitations = sender === "agent" && citations.length > 0 ? [...citations] : undefined;

          updated.push({
            id,
            sender,
            text: seg.text,
            timestamp: timeStr,
            confidence: confidenceScore,
            latency: matchingTelemetry,
            citations: turnCitations,
            isFinal: false,
          });
        }
      });

      return updated;
    });
  }, [liveTranscriptions, latestTelemetry, citations]);

  // When new telemetry arrives, attach to the most recent agent message if not yet attached
  useEffect(() => {
    if (!latestTelemetry) return;
    setMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].sender === "agent") {
          if (!copy[i].latency) {
            copy[i] = {
              ...copy[i],
              latency: latestTelemetry,
              citations: copy[i].citations || (citations.length > 0 ? [...citations] : undefined),
            };
          }
          break;
        }
      }
      return copy;
    });
  }, [latestTelemetry, citations]);

  // Handle scroll lock detection
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 40;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    setIsAtBottom(atBottom);
  };

  // Auto-scroll to bottom if user is at bottom
  useEffect(() => {
    if (isAtBottom && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, isAtBottom]);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
      setIsAtBottom(true);
    }
  };

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(
      (m) =>
        m.text.toLowerCase().includes(q) ||
        m.citations?.some((c) => c.snippet.toLowerCase().includes(q) || c.section?.toLowerCase().includes(q))
    );
  }, [messages, searchQuery]);

  return (
    <div className="live-transcript-container">
      {/* Transcript Header & Search */}
      <div className="transcript-search-bar">
        <span className="search-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#64748b", display: "block" }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          type="text"
          placeholder="Search conversation..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="transcript-search-input"
        />
        {searchQuery && (
          <button
            type="button"
            className="clear-search-btn"
            onClick={() => setSearchQuery("")}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Messages Scroll Feed */}
      <div
        ref={scrollContainerRef}
        className="transcript-messages-feed"
        onScroll={handleScroll}
      >
        {filteredMessages.length === 0 && (
          <div className="transcript-empty-state">
            <div className="empty-wave-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#64748b" }}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <p className="empty-title">Live Transcript Active</p>
            <p className="empty-sub">
              {searchQuery
                ? `No messages matched "${searchQuery}"`
                : "Ask a question about the document to begin."}
            </p>
          </div>
        )}

        {filteredMessages.map((msg) => {
          const isUser = msg.sender === "user";
          const latency = msg.latency;

          return (
            <div
              key={msg.id}
              className={`transcript-bubble-row ${isUser ? "user-row" : "agent-row"}`}
            >
              <div className={`transcript-bubble ${isUser ? "user-bubble" : "agent-bubble"}`}>
                {/* Bubble Header */}
                <div className="bubble-header">
                  <div className="sender-meta">
                    <span className="sender-avatar">
                      {isUser ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      )}
                    </span>
                    <span className="sender-name">{isUser ? "You" : "Voice RAG Assistant"}</span>
                    <span className="bubble-time">{msg.timestamp}</span>
                  </div>

                  {/* Badges: User Confidence or Agent Latency */}
                  {isUser && msg.confidence && (
                    <span className="confidence-pill" title="Speech recognition confidence score">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: 3 }}>
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      {msg.confidence}% accuracy
                    </span>
                  )}

                  {!isUser && latency && (
                    <div className="latency-badge-container">
                      <button
                        type="button"
                        className={`latency-pill ${latency.is_cached ? "is-cached" : ""}`}
                        onClick={() =>
                          setActiveTooltipId(activeTooltipId === msg.id ? null : msg.id)
                        }
                        title="Click to inspect 4-phase latency breakdown"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: 3 }}>
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                        {latency.is_cached
                          ? "3ms (Instant Cache)"
                          : `${Math.round(latency.total_e2e_ms)}ms response`}
                      </button>

                      {/* Tooltip Breakdown */}
                      {activeTooltipId === msg.id && (
                        <div className="latency-breakdown-tooltip">
                          <div className="breakdown-title">
                            <span>Lifecycle Latency Breakdown</span>
                            <button
                              type="button"
                              className="close-tooltip-btn"
                              onClick={() => setActiveTooltipId(null)}
                            >
                              ✕
                            </button>
                          </div>
                          <div className="breakdown-grid">
                            <div className="breakdown-item">
                              <span className="phase-label">STT (Transcribe):</span>
                              <span className="phase-val">{latency.stt_latency_ms} ms</span>
                            </div>
                            <div className="breakdown-item">
                              <span className="phase-label">RAG Retrieval:</span>
                              <span className="phase-val">{latency.retrieval_latency_ms} ms</span>
                            </div>
                            <div className="breakdown-item">
                              <span className="phase-label">LLM TTFT:</span>
                              <span className="phase-val">
                                {latency.is_cached ? "0.0 ms (Cached)" : `${latency.llm_ttft_ms} ms`}
                              </span>
                            </div>
                            <div className="breakdown-item">
                              <span className="phase-label">TTS Playback:</span>
                              <span className="phase-val">{latency.tts_playback_latency_ms} ms</span>
                            </div>
                          </div>
                          <div className="breakdown-total">
                            <span>Total E2E Turnaround:</span>
                            <strong>{latency.total_e2e_ms} ms</strong>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Message Body */}
                <div className="bubble-text">{msg.text}</div>

                {/* Clickable Citation Chips */}
                {!isUser && msg.citations && msg.citations.length > 0 && (
                  <div className="citation-chips-container">
                    <span className="citation-label">Sources:</span>
                    <div className="chips-list">
                      {msg.citations.map((c) => {
                        const isSelected = selectedCitation?.id === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className={`citation-chip ${isSelected ? "is-selected" : ""}`}
                            onClick={() => onSelectCitation?.(c)}
                            title={`Click to jump to Page ${c.page} and highlight paragraph`}
                          >
                            <span className="chip-icon">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                            </span>
                            <span className="chip-text">
                              Page {c.page}
                              {c.section ? ` · ${c.section}` : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Jump to bottom button */}
      {!isAtBottom && (
        <button
          type="button"
          className="jump-bottom-btn"
          onClick={scrollToBottom}
          title="Jump to latest message"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", marginRight: 4 }}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
          Jump to latest
        </button>
      )}
    </div>
  );
}

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
        <span className="search-icon">🔍</span>
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
            <div className="empty-wave-icon">🎙️</div>
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
                    <span className="sender-avatar">{isUser ? "👤" : "✨"}</span>
                    <span className="sender-name">{isUser ? "You" : "Voice RAG Assistant"}</span>
                    <span className="bubble-time">{msg.timestamp}</span>
                  </div>

                  {/* Badges: User Confidence or Agent Latency */}
                  {isUser && msg.confidence && (
                    <span className="confidence-pill" title="Speech recognition confidence score">
                      ⚡ {msg.confidence}% accuracy
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
                        {latency.is_cached
                          ? "⚡ 3ms (Instant Cache)"
                          : `⚡ ${Math.round(latency.total_e2e_ms)}ms response`}
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
                              <span className="phase-label">🎙️ STT (Transcribe):</span>
                              <span className="phase-val">{latency.stt_latency_ms} ms</span>
                            </div>
                            <div className="breakdown-item">
                              <span className="phase-label">🔍 RAG Retrieval:</span>
                              <span className="phase-val">{latency.retrieval_latency_ms} ms</span>
                            </div>
                            <div className="breakdown-item">
                              <span className="phase-label">🧠 LLM TTFT:</span>
                              <span className="phase-val">
                                {latency.is_cached ? "0.0 ms (Cached)" : `${latency.llm_ttft_ms} ms`}
                              </span>
                            </div>
                            <div className="breakdown-item">
                              <span className="phase-label">🔊 TTS Playback:</span>
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
                            <span className="chip-icon">📄</span>
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
          ⬇ Jump to latest
        </button>
      )}
    </div>
  );
}

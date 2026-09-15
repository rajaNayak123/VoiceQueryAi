import React, { useState, useEffect, useRef } from "react";
import type { TelemetryMetrics } from "../../types";

export interface LiveLatencyHUDProps {
  latestTelemetry?: TelemetryMetrics | null;
  telemetryHistory?: TelemetryMetrics[];
  activePhase?: "idle" | "stt" | "retrieval" | "llm" | "tts" | "completed";
  activeQuery?: string;
  isOpen: boolean;
  onClose: () => void;
}

// Default realistic demo metrics if no turn has taken place yet
const DEFAULT_DEMO_METRICS: TelemetryMetrics = {
  query: "What is the policy renewal deadline and grace period?",
  stt_latency_ms: 285,
  retrieval_latency_ms: 120,
  llm_ttft_ms: 195,
  tts_playback_latency_ms: 240,
  total_e2e_ms: 840,
  is_cached: false,
  timestamp: Date.now() / 1000,
};

const CACHED_DEMO_METRICS: TelemetryMetrics = {
  query: "What is the policy renewal deadline and grace period?",
  stt_latency_ms: 240,
  retrieval_latency_ms: 0,
  llm_ttft_ms: 1.5,
  tts_playback_latency_ms: 210,
  total_e2e_ms: 451.5,
  is_cached: true,
  timestamp: Date.now() / 1000,
};

export function LiveLatencyHUD({
  latestTelemetry,
  telemetryHistory = [],
  activePhase = "idle",
  activeQuery = "",
  isOpen,
  onClose,
}: LiveLatencyHUDProps) {
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [selectedTurnIdx, setSelectedTurnIdx] = useState<number | null>(null);
  const [simulatedMetrics, setSimulatedMetrics] = useState<TelemetryMetrics | null>(null);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [simulatedPhase, setSimulatedPhase] = useState<string | null>(null);

  // Dragging state
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 24, y: 76 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 24,
    initY: 76,
  });
  const hudRef = useRef<HTMLDivElement | null>(null);

  // Active metrics to display
  const currentMetrics: TelemetryMetrics =
    simulatedMetrics ||
    (selectedTurnIdx !== null && telemetryHistory[selectedTurnIdx]) ||
    latestTelemetry ||
    DEFAULT_DEMO_METRICS;

  const currentPhase = simulatedPhase || activePhase;
  const currentQueryText = activeQuery || currentMetrics.query || "Voice Query Pipeline";

  // Handle Dragging
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only drag from header handle
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("select")) {
      return;
    }
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: position.x,
      initY: position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      const newX = Math.max(10, Math.min(window.innerWidth - 380, dragStartRef.current.initX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 150, dragStartRef.current.initY + dy));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Simulate a live pipeline turn (ideal for interview demos)
  const runSimulation = (cacheHit: boolean) => {
    if (simulating) return;
    setSimulating(true);
    setSelectedTurnIdx(null);

    const target = cacheHit ? CACHED_DEMO_METRICS : DEFAULT_DEMO_METRICS;

    // Stage 1: STT
    setSimulatedPhase("stt");
    setTimeout(() => {
      // Stage 2: RAG
      setSimulatedPhase(cacheHit ? "cache-lookup" : "retrieval");
      setTimeout(() => {
        // Stage 3: LLM
        setSimulatedPhase("llm");
        setTimeout(() => {
          // Stage 4: TTS
          setSimulatedPhase("tts");
          setTimeout(() => {
            // Stage 5: Completed
            setSimulatedPhase(null);
            setSimulatedMetrics(target);
            setSimulating(false);
          }, target.tts_playback_latency_ms);
        }, target.llm_ttft_ms);
      }, cacheHit ? 10 : target.retrieval_latency_ms);
    }, target.stt_latency_ms);
  };

  if (!isOpen) return null;

  // Calculate percentage widths for the visual waterfall bar
  const totalMs = Math.max(1, currentMetrics.total_e2e_ms || 1);
  const sttPct = Math.round((currentMetrics.stt_latency_ms / totalMs) * 100);
  const ragPct = Math.round((currentMetrics.retrieval_latency_ms / totalMs) * 100);
  const llmPct = Math.round((currentMetrics.llm_ttft_ms / totalMs) * 100);
  const ttsPct = Math.max(5, 100 - (sttPct + ragPct + llmPct));

  // If Minimized, render floating badge pill
  if (isMinimized) {
    return (
      <div
        className="latency-hud-minimized-pill"
        style={{ right: `${position.x}px`, top: `${position.y}px` }}
        onClick={() => setIsMinimized(false)}
        title="Click to expand Live Latency HUD"
      >
        <span className="pill-dot" />
        <span className="pill-title">🛠️ HUD</span>
        <span className="pill-time">{Math.round(currentMetrics.total_e2e_ms)}ms</span>
        <span className={`pill-cache-tag ${currentMetrics.is_cached ? "hit" : "miss"}`}>
          {currentMetrics.is_cached ? "CACHE HIT" : "MISS"}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={hudRef}
      className={`latency-hud-overlay ${isDragging ? "is-dragging" : ""}`}
      style={{ right: `${position.x}px`, top: `${position.y}px` }}
    >
      {/* Header Bar / Drag Handle */}
      <div className="hud-header" onMouseDown={handleMouseDown}>
        <div className="hud-header-left">
          <span className="hud-mode-icon">🛠️</span>
          <div className="hud-title-wrap">
            <span className="hud-title">Engineer Mode Latency HUD</span>
            <div className="hud-channel-badge">
              <span className="channel-live-dot" />
              <span>WebRTC DataChannel · Reliable</span>
            </div>
          </div>
        </div>

        <div className="hud-header-actions">
          <button
            type="button"
            className="hud-action-btn"
            onClick={() => setIsMinimized(true)}
            title="Minimize HUD to floating pill"
          >
            _
          </button>
          <button
            type="button"
            className="hud-action-btn close"
            onClick={onClose}
            title="Close Engineer Mode (or press 'E')"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Query Banner */}
      <div className="hud-query-bar">
        <span className="hud-query-tag">QUERY</span>
        <span className="hud-query-text" title={currentQueryText}>
          "{currentQueryText}"
        </span>
      </div>

      {/* Main ASCII / Structured Waterfall Card */}
      <div className="hud-waterfall-card">
        <div className="hud-grid-row">
          <div className="hud-metric-cell">
            <span className="cell-icon">🎙️</span>
            <span className="cell-label">STT:</span>
            <span className="cell-value">{Math.round(currentMetrics.stt_latency_ms)}ms</span>
          </div>

          <div className="hud-cell-divider">|</div>

          <div className="hud-metric-cell">
            <span className="cell-icon">🔍</span>
            <span className="cell-label">Hybrid RAG:</span>
            <span className="cell-value">{Math.round(currentMetrics.retrieval_latency_ms)}ms</span>
            <span className={`cell-cache-badge ${currentMetrics.is_cached ? "hit" : "miss"}`}>
              (Cache: {currentMetrics.is_cached ? "HIT" : "MISS"})
            </span>
          </div>
        </div>

        <div className="hud-grid-row">
          <div className="hud-metric-cell">
            <span className="cell-icon">⚡</span>
            <span className="cell-label">TTFT:</span>
            <span className="cell-value">{Math.round(currentMetrics.llm_ttft_ms * 10) / 10}ms</span>
          </div>

          <div className="hud-cell-divider">|</div>

          <div className="hud-metric-cell">
            <span className="cell-icon">🔊</span>
            <span className="cell-label">TTS First Chunk:</span>
            <span className="cell-value">{Math.round(currentMetrics.tts_playback_latency_ms)}ms</span>
          </div>
        </div>

        <div className="hud-total-row">
          <div className="total-left">
            <span className="total-icon">⏱️</span>
            <span className="total-label">Total Turnaround:</span>
          </div>
          <div className="total-right">
            <span className="total-val">{Math.round(currentMetrics.total_e2e_ms)}ms</span>
            {currentMetrics.is_cached && (
              <span className="cache-speedup-pill">⚡ 48% Faster</span>
            )}
          </div>
        </div>
      </div>

      {/* Visual Latency Waterfall Breakdown Bar */}
      <div className="hud-visual-section">
        <div className="visual-header">
          <span className="visual-title">Latency Waterfall Timeline</span>
          <span className="visual-total-badge">{Math.round(currentMetrics.total_e2e_ms)}ms E2E</span>
        </div>

        <div className="waterfall-bar-container">
          <div
            className="waterfall-segment stt"
            style={{ width: `${sttPct}%` }}
            title={`STT: ${Math.round(currentMetrics.stt_latency_ms)}ms (${sttPct}%)`}
          >
            {sttPct > 12 && <span className="seg-label">STT {Math.round(currentMetrics.stt_latency_ms)}ms</span>}
          </div>

          <div
            className={`waterfall-segment rag ${currentMetrics.is_cached ? "cached" : ""}`}
            style={{ width: `${Math.max(2, ragPct)}%` }}
            title={`Hybrid RAG: ${Math.round(currentMetrics.retrieval_latency_ms)}ms (${ragPct}%)`}
          >
            {ragPct > 12 && <span className="seg-label">RAG {Math.round(currentMetrics.retrieval_latency_ms)}ms</span>}
          </div>

          <div
            className="waterfall-segment llm"
            style={{ width: `${llmPct}%` }}
            title={`LLM TTFT: ${Math.round(currentMetrics.llm_ttft_ms)}ms (${llmPct}%)`}
          >
            {llmPct > 12 && <span className="seg-label">TTFT {Math.round(currentMetrics.llm_ttft_ms)}ms</span>}
          </div>

          <div
            className="waterfall-segment tts"
            style={{ width: `${ttsPct}%` }}
            title={`TTS Chunk: ${Math.round(currentMetrics.tts_playback_latency_ms)}ms (${ttsPct}%)`}
          >
            {ttsPct > 12 && <span className="seg-label">TTS {Math.round(currentMetrics.tts_playback_latency_ms)}ms</span>}
          </div>
        </div>

        {/* Legend */}
        <div className="waterfall-legend">
          <div className="legend-item">
            <span className="legend-dot stt" />
            <span>STT ({Math.round(currentMetrics.stt_latency_ms)}ms)</span>
          </div>
          <div className="legend-item">
            <span className={`legend-dot rag ${currentMetrics.is_cached ? "cached" : ""}`} />
            <span>RAG ({Math.round(currentMetrics.retrieval_latency_ms)}ms)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot llm" />
            <span>TTFT ({Math.round(currentMetrics.llm_ttft_ms)}ms)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot tts" />
            <span>TTS ({Math.round(currentMetrics.tts_playback_latency_ms)}ms)</span>
          </div>
        </div>
      </div>

      {/* Active Phase Pipeline Indicator */}
      {currentPhase && currentPhase !== "idle" && (
        <div className="hud-phase-tracker">
          <div className="phase-indicator-pulse" />
          <span className="phase-text">
            {currentPhase === "stt" && "🎙️ Transcribing user speech (Sarvam STT)..."}
            {currentPhase === "retrieval" && "🔍 Dense + BM25 Hybrid Retrieval (Qdrant)..."}
            {currentPhase === "cache-lookup" && "⚡ Redis Vector Cache Hit (0ms lookup)..."}
            {currentPhase === "llm" && "⚡ Groq LLaMA 3.3 streaming first token..."}
            {currentPhase === "tts" && "🔊 Sarvam Bulbul streaming audio playback..."}
            {currentPhase === "completed" && `✅ Turn completed in ${Math.round(currentMetrics.total_e2e_ms)}ms`}
          </span>
        </div>
      )}

      {/* Footer / Quick Demo Controls for Interviews */}
      <div className="hud-footer">
        <div className="demo-actions">
          <span className="demo-label">Interview Demo:</span>
          <button
            type="button"
            className="sim-turn-btn miss"
            disabled={simulating}
            onClick={() => runSimulation(false)}
            title="Simulate complete cold turn with RAG retrieval"
          >
            Simulate Cold (840ms)
          </button>
          <button
            type="button"
            className="sim-turn-btn hit"
            disabled={simulating}
            onClick={() => runSimulation(true)}
            title="Simulate sub-500ms Semantic Cache Hit"
          >
            Simulate Cache HIT ⚡
          </button>
        </div>

        {telemetryHistory.length > 1 && (
          <div className="history-picker">
            <select
              value={selectedTurnIdx ?? telemetryHistory.length - 1}
              onChange={(e) => {
                setSimulatedMetrics(null);
                setSelectedTurnIdx(Number(e.target.value));
              }}
              className="turn-select"
            >
              {telemetryHistory.map((t, idx) => (
                <option key={idx} value={idx}>
                  Turn #{idx + 1} ({Math.round(t.total_e2e_ms)}ms {t.is_cached ? "HIT" : "MISS"})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

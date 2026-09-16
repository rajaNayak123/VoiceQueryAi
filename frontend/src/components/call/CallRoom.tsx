import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { useState, useEffect, useRef } from "react";
import { MicControl } from "./MicControl";
import { TranscriptPanel } from "./TranscriptPanel";
import { AgentVisualizer } from "./AgentVisualizer";
import { EndCallButton } from "./EndCallButton";
import { PdfViewer } from "../pdf/PdfViewer";
import { CitationsPanel } from "./CitationsPanel";
import { SessionSummaryModal } from "./SessionSummaryModal";
import { LiveLatencyHUD } from "./LiveLatencyHUD";
import { useCitations } from "../../hooks/useCitations";
import { getDocumentPdfUrl } from "../../api/client";

interface DocumentItemSummary {
  id: string;
  filename: string;
}

interface CallRoomProps {
  token: string;
  livekitUrl: string;
  documentId?: string;
  documentIds?: string[];
  documents?: DocumentItemSummary[];
  filename?: string;
  isComparison?: boolean;
  onCallEnded: () => void;
}

function CallRoomInner({
  documentId,
  documentIds = [],
  documents = [],
  filename,
  isComparison = false,
  onCallEnded,
}: {
  documentId?: string;
  documentIds?: string[];
  documents?: DocumentItemSummary[];
  filename?: string;
  isComparison?: boolean;
  onCallEnded: () => void;
}) {
  const {
    citations,
    allCitations,
    selectedCitation,
    activeSpotlight,
    agentSpeaking,
    latestTelemetry,
    telemetryHistory,
    activePhase,
    activeQuery,
    selectCitation,
    stopAgentSpeaking,
  } = useCitations();

  const { localParticipant } = useLocalParticipant();
  const [engineerMode, setEngineerMode] = useState<boolean>(true);

  // Normalize documents list
  const normalizedDocs: DocumentItemSummary[] =
    documents && documents.length > 0
      ? documents
      : documentIds && documentIds.length > 0
      ? documentIds.map((id, idx) => ({ id, filename: `Document ${idx + 1}` }))
      : documentId
      ? [{ id: documentId, filename: filename || "Document" }]
      : [];

  const effectiveIsComparison = isComparison || normalizedDocs.length > 1;
  const [activeDocId, setActiveDocId] = useState<string>(
    normalizedDocs[0]?.id || documentId || ""
  );
  const [viewMode, setViewMode] = useState<"tabbed" | "split">(
    effectiveIsComparison && normalizedDocs.length >= 2 ? "tabbed" : "tabbed"
  );

  // Auto-focus document switcher: when agent voice or user citation targets a specific document, switch tab
  useEffect(() => {
    const targetDocId = activeSpotlight?.documentId || selectedCitation?.documentId;
    if (targetDocId && normalizedDocs.some((d) => d.id === targetDocId)) {
      if (activeDocId !== targetDocId && viewMode === "tabbed") {
        setActiveDocId(targetDocId);
      }
    }
  }, [activeSpotlight?.documentId, activeSpotlight?.timestamp, selectedCitation?.documentId, activeDocId, normalizedDocs, viewMode]);

  // Keyboard shortcut: Press 'E' to toggle Engineer Mode Live Latency HUD
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (e.key === "e" || e.key === "E") {
        setEngineerMode((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Instant local barge-in: If user begins speaking, instantly cut off active agent speaking state
  useEffect(() => {
    if (localParticipant.isSpeaking && agentSpeaking) {
      stopAgentSpeaking();
    }
  }, [localParticipant.isSpeaking, agentSpeaking, stopAgentSpeaking]);

  const [activeTab, setActiveTab] = useState<"citations" | "transcript">("citations");
  const [isSummaryOpen, setIsSummaryOpen] = useState<boolean>(false);
  const startTimeRef = useRef<number>(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Track call duration timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleEndCallRequest = () => {
    setIsSummaryOpen(true);
  };

  const handleConfirmExit = () => {
    setIsSummaryOpen(false);
    onCallEnded();
  };

  if (normalizedDocs.length === 0 && !documentId) {
    // Single-column fallback when no document is associated
    return (
      <div className="call-room-fallback">
        <RoomAudioRenderer />
        <AgentVisualizer />
        <TranscriptPanel
          citations={citations}
          selectedCitation={selectedCitation}
          onSelectCitation={selectCitation}
          latestTelemetry={latestTelemetry}
          telemetryHistory={telemetryHistory}
        />
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <MicControl />
          <button
            type="button"
            className={`engineer-mode-btn ${engineerMode ? "is-active" : ""}`}
            onClick={() => setEngineerMode((prev) => !prev)}
            title="Toggle Engineer Mode: Real-time Live Latency HUD (Press 'E')"
          >
            <span className="engineer-icon">🛠️</span>
            <span>Engineer Mode</span>
            <span className={`mode-status-dot ${engineerMode ? "active" : ""}`} />
          </button>
          <button
            type="button"
            className="recap-trigger-btn"
            onClick={() => setIsSummaryOpen(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <line x1="10" y1="9" x2="8" y2="9" />
            </svg>
            <span>Summary</span>
          </button>
          <EndCallButton onEnded={handleEndCallRequest} />
        </div>

        <LiveLatencyHUD
          latestTelemetry={latestTelemetry}
          telemetryHistory={telemetryHistory}
          activePhase={activePhase}
          activeQuery={activeQuery}
          isOpen={engineerMode}
          onClose={() => setEngineerMode(false)}
        />

        <SessionSummaryModal
          isOpen={isSummaryOpen}
          onClose={() => setIsSummaryOpen(false)}
          onEndCallConfirm={handleConfirmExit}
          filename={filename}
          durationSeconds={elapsedSeconds}
          allCitations={allCitations}
          telemetryHistory={telemetryHistory}
        />
      </div>
    );
  }

  const activeDoc = normalizedDocs.find((d) => d.id === activeDocId) || normalizedDocs[0];
  const activePdfUrl = getDocumentPdfUrl(activeDoc.id);

  // Helper for citations filtered to a specific document
  const getCitationsForDoc = (docId: string) =>
    citations.filter((c) => !c.documentId || c.documentId === docId);

  const getSpotlightForDoc = (docId: string) =>
    activeSpotlight && (!activeSpotlight.documentId || activeSpotlight.documentId === docId)
      ? activeSpotlight
      : null;

  return (
    <div className="call-room-split-layout">
      <RoomAudioRenderer />

      {/* Left Pane: In-browser PDF Viewer with Comparison Bar */}
      <section className="call-pdf-section">
        {effectiveIsComparison && normalizedDocs.length > 1 && (
          <div className="comparison-doc-switcher-bar">
            <div className="comparison-pills-row">
              {normalizedDocs.map((doc, idx) => {
                const isDocActive = activeDocId === doc.id;
                const isDocSpeaking =
                  agentSpeaking &&
                  ((activeSpotlight?.documentId === doc.id) ||
                    (!activeSpotlight?.documentId && idx === 0));
                return (
                  <button
                    key={doc.id}
                    type="button"
                    className={`comparison-doc-pill ${isDocActive ? "is-active" : ""} ${
                      idx === 0 ? "pill-doc-a" : "pill-doc-b"
                    }`}
                    onClick={() => {
                      setActiveDocId(doc.id);
                      if (viewMode === "split") setViewMode("tabbed");
                    }}
                  >
                    <span className="doc-pill-tag">Doc {String.fromCharCode(65 + idx)}</span>
                    <span className="doc-pill-name">{doc.filename}</span>
                    {isDocSpeaking && (
                      <span className="doc-speaking-indicator" title="Agent is currently citing this document">
                        <span className="pulse-mini-ring" />
                        <span className="pulse-mini-core" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Split / Tabbed View Toggle */}
            <div className="view-mode-toggle-group">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === "tabbed" ? "active" : ""}`}
                onClick={() => setViewMode("tabbed")}
                title="Single Document Focus with Tab Switcher"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
                <span>Tabbed</span>
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === "split" ? "active" : ""}`}
                onClick={() => setViewMode("split")}
                title="Side-by-Side Dual Document Comparison"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="3" y="3" width="8" height="18" rx="1.5" />
                  <rect x="13" y="3" width="8" height="18" rx="1.5" />
                </svg>
                <span>Side-by-Side</span>
              </button>
            </div>
          </div>
        )}

        {/* PDF Renderers based on View Mode */}
        {viewMode === "split" && normalizedDocs.length >= 2 ? (
          <div className="comparison-dual-pdf-grid">
            <div className="dual-pdf-pane pane-a">
              <PdfViewer
                fileUrl={getDocumentPdfUrl(normalizedDocs[0].id)}
                filename={`Doc A: ${normalizedDocs[0].filename}`}
                citations={getCitationsForDoc(normalizedDocs[0].id)}
                selectedCitation={
                  selectedCitation?.documentId === normalizedDocs[0].id ? selectedCitation : null
                }
                activeSpotlight={getSpotlightForDoc(normalizedDocs[0].id)}
                agentSpeaking={agentSpeaking && activeSpotlight?.documentId === normalizedDocs[0].id}
                onSelectCitation={selectCitation}
              />
            </div>
            <div className="dual-pdf-pane pane-b">
              <PdfViewer
                fileUrl={getDocumentPdfUrl(normalizedDocs[1].id)}
                filename={`Doc B: ${normalizedDocs[1].filename}`}
                citations={getCitationsForDoc(normalizedDocs[1].id)}
                selectedCitation={
                  selectedCitation?.documentId === normalizedDocs[1].id ? selectedCitation : null
                }
                activeSpotlight={getSpotlightForDoc(normalizedDocs[1].id)}
                agentSpeaking={agentSpeaking && activeSpotlight?.documentId === normalizedDocs[1].id}
                onSelectCitation={selectCitation}
              />
            </div>
          </div>
        ) : (
          <PdfViewer
            fileUrl={activePdfUrl}
            filename={activeDoc.filename}
            citations={getCitationsForDoc(activeDoc.id)}
            selectedCitation={
              selectedCitation?.documentId === activeDoc.id || !selectedCitation?.documentId
                ? selectedCitation
                : null
            }
            activeSpotlight={getSpotlightForDoc(activeDoc.id)}
            agentSpeaking={
              agentSpeaking &&
              (!activeSpotlight?.documentId || activeSpotlight.documentId === activeDoc.id)
            }
            onSelectCitation={selectCitation}
          />
        )}
      </section>

      {/* Right Pane: Assistant Controls, Citations Stream & Live Transcript */}
      <aside className="call-assistant-section">
        {/* Assistant Header & Visualizer */}
        <div className="assistant-card">
          <div className="assistant-card-header">
            <div className="assistant-identity">
              <span className="assistant-status-dot" />
              <span className="assistant-name">Voice RAG Assistant</span>
            </div>
            <div className="header-right-actions">
              {agentSpeaking && (
                <span className="speaking-tag">
                  <span className="pulse-icon" />
                  Speaking
                </span>
              )}
              <button
                type="button"
                className={`engineer-mode-btn ${engineerMode ? "is-active" : ""}`}
                onClick={() => setEngineerMode((prev) => !prev)}
                title="Toggle Engineer Mode: Real-time Live Latency HUD (Press 'E')"
              >
                <span className="engineer-icon">🛠️</span>
                <span>Engineer Mode</span>
                <span className={`mode-status-dot ${engineerMode ? "active" : ""}`} />
              </button>
              <button
                type="button"
                className="recap-trigger-btn"
                onClick={() => setIsSummaryOpen(true)}
                title="View automated session summary & export"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <line x1="10" y1="9" x2="8" y2="9" />
                </svg>
                <span>Recap</span>
              </button>
            </div>
          </div>

          <div className="visualizer-wrapper">
            <AgentVisualizer />
          </div>

          <div className="call-controls-bar">
            <MicControl />
            <EndCallButton onEnded={handleEndCallRequest} />
          </div>
        </div>

        {/* Tab Navigation for Citations and Transcript */}
        <div className="panel-tab-bar">
          <button
            type="button"
            className={`panel-tab-btn ${activeTab === "citations" ? "is-active" : ""}`}
            onClick={() => setActiveTab("citations")}
          >
            Citations
            {citations.length > 0 && (
              <span className="tab-pill">{citations.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`panel-tab-btn ${activeTab === "transcript" ? "is-active" : ""}`}
            onClick={() => setActiveTab("transcript")}
          >
            Live Transcript
          </button>
        </div>

        {/* Tab Content */}
        <div className="panel-content-area">
          {activeTab === "citations" ? (
            <CitationsPanel
              citations={citations}
              allCitations={allCitations}
              selectedCitation={selectedCitation}
              agentSpeaking={agentSpeaking}
              onSelectCitation={selectCitation}
            />
          ) : (
            <div className="transcript-panel-wrapper">
              <TranscriptPanel
                citations={citations}
                selectedCitation={selectedCitation}
                onSelectCitation={selectCitation}
                latestTelemetry={latestTelemetry}
                telemetryHistory={telemetryHistory}
              />
            </div>
          )}
        </div>
      </aside>

      {/* Session Export & Summary Modal */}
      <SessionSummaryModal
        isOpen={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
        onEndCallConfirm={handleConfirmExit}
        filename={filename}
        durationSeconds={elapsedSeconds}
        allCitations={allCitations}
        telemetryHistory={telemetryHistory}
      />

      {/* Real-time Floating Live Latency HUD (Engineer Mode) */}
      <LiveLatencyHUD
        latestTelemetry={latestTelemetry}
        telemetryHistory={telemetryHistory}
        activePhase={activePhase}
        activeQuery={activeQuery}
        isOpen={engineerMode}
        onClose={() => setEngineerMode(false)}
      />
    </div>
  );
}

export function CallRoom({
  token,
  livekitUrl,
  documentId,
  documentIds,
  documents,
  filename,
  isComparison,
  onCallEnded,
}: CallRoomProps) {
  const [connectionError, setConnectionError] = useState<string | null>(null);

  if (connectionError) {
    return (
      <div className="connection-error-container">
        <p>Could not connect to the call: {connectionError}</p>
        <button
          type="button"
          onClick={onCallEnded}
          className="error-return-btn"
        >
          Return to home
        </button>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={livekitUrl}
      connect={true}
      audio={true}
      video={false}
      onError={(err) => setConnectionError(err.message)}
      onDisconnected={onCallEnded}
      className="livekit-room-root"
    >
      <CallRoomInner
        documentId={documentId}
        documentIds={documentIds}
        documents={documents}
        filename={filename}
        isComparison={isComparison}
        onCallEnded={onCallEnded}
      />
    </LiveKitRoom>
  );
}

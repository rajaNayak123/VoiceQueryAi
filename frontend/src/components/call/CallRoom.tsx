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
import { useCitations } from "../../hooks/useCitations";
import { getDocumentPdfUrl } from "../../api/client";

interface CallRoomProps {
  token: string;
  livekitUrl: string;
  documentId?: string;
  filename?: string;
  onCallEnded: () => void;
}

function CallRoomInner({
  documentId,
  filename,
  onCallEnded,
}: {
  documentId?: string;
  filename?: string;
  onCallEnded: () => void;
}) {
  const {
    citations,
    allCitations,
    selectedCitation,
    agentSpeaking,
    latestTelemetry,
    telemetryHistory,
    selectCitation,
    stopAgentSpeaking,
  } = useCitations();

  const { localParticipant } = useLocalParticipant();

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
    // Open summary recap so user can export before exiting
    setIsSummaryOpen(true);
  };

  const handleConfirmExit = () => {
    setIsSummaryOpen(false);
    onCallEnded();
  };

  if (!documentId) {
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
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <MicControl />
          <button
            type="button"
            className="recap-trigger-btn"
            onClick={() => setIsSummaryOpen(true)}
          >
            📋 Summary
          </button>
          <EndCallButton onEnded={handleEndCallRequest} />
        </div>

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

  const pdfUrl = getDocumentPdfUrl(documentId);

  return (
    <div className="call-room-split-layout">
      <RoomAudioRenderer />

      {/* Left Pane: In-browser PDF Viewer with real-time dynamic highlights */}
      <section className="call-pdf-section">
        <PdfViewer
          fileUrl={pdfUrl}
          filename={filename}
          citations={citations}
          selectedCitation={selectedCitation}
          agentSpeaking={agentSpeaking}
        />
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
                className="recap-trigger-btn"
                onClick={() => setIsSummaryOpen(true)}
                title="View automated session summary & export"
              >
                📋 Recap
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
    </div>
  );
}

export function CallRoom({
  token,
  livekitUrl,
  documentId,
  filename,
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
        filename={filename}
        onCallEnded={onCallEnded}
      />
    </LiveKitRoom>
  );
}

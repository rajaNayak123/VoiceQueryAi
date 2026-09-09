import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { useState } from "react";
import { MicControl } from "./MicControl";
import { TranscriptPanel } from "./TranscriptPanel";
import { AgentVisualizer } from "./AgentVisualizer";
import { EndCallButton } from "./EndCallButton";
import { PdfViewer } from "../pdf/PdfViewer";
import { CitationsPanel } from "./CitationsPanel";
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
    selectCitation,
  } = useCitations();

  const [activeTab, setActiveTab] = useState<"citations" | "transcript">("citations");

  if (!documentId) {
    // Single-column fallback when no document is associated
    return (
      <div className="call-room-fallback">
        <RoomAudioRenderer />
        <AgentVisualizer />
        <TranscriptPanel />
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <MicControl />
          <EndCallButton onEnded={onCallEnded} />
        </div>
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
            {agentSpeaking && (
              <span className="speaking-tag">
                <span className="pulse-icon" />
                Speaking
              </span>
            )}
          </div>

          <div className="visualizer-wrapper">
            <AgentVisualizer />
          </div>

          <div className="call-controls-bar">
            <MicControl />
            <EndCallButton onEnded={onCallEnded} />
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
              <TranscriptPanel />
            </div>
          )}
        </div>
      </aside>
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

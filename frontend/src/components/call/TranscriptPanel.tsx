import { useTranscriptions } from "@livekit/components-react";

// Uses the useTranscriptions hook (text-stream based). Do NOT use
// RoomEvent.TranscriptionReceived - it's deprecated and unreliable now that
// LiveKit delivers transcriptions via text streams.
export function TranscriptPanel() {
  const transcriptions = useTranscriptions();

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 16,
        height: 280,
        overflowY: "auto",
        background: "#fff",
      }}
    >
      {transcriptions.length === 0 && (
        <p style={{ color: "#94a3b8" }}>Transcript will appear here...</p>
      )}
      {transcriptions.map((segment) => (
        <p key={segment.streamInfo.id} style={{ marginBottom: 8 }}>
          <strong>
            {segment.participantInfo?.identity?.startsWith("user") ? "You" : "Agent"}:
          </strong>{" "}
          {segment.text}
        </p>
      ))}
    </div>
  );
}

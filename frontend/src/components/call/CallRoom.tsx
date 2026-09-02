import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { useState } from "react";
import { MicControl } from "./MicControl";
import { TranscriptPanel } from "./TranscriptPanel";
import { AgentVisualizer } from "./AgentVisualizer";
import { EndCallButton } from "./EndCallButton";

interface CallRoomProps {
  token: string;
  livekitUrl: string;
  onCallEnded: () => void;
}

export function CallRoom({ token, livekitUrl, onCallEnded }: CallRoomProps) {
  const [connectionError, setConnectionError] = useState<string | null>(null);

  if (connectionError) {
    return (
      <div style={{ color: "#dc2626" }}>
        <p>Could not connect to the call: {connectionError}</p>
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
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      <RoomAudioRenderer />
      <AgentVisualizer />
      <TranscriptPanel />
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <MicControl />
        <EndCallButton onEnded={onCallEnded} />
      </div>
    </LiveKitRoom>
  );
}

import { useVoiceAssistant } from "@livekit/components-react";
import { AudioWaveformVisualizer } from "./AudioWaveformVisualizer";

export function AgentVisualizer() {
  const { state, audioTrack } = useVoiceAssistant();

  return (
    <div className="agent-visualizer-container">
      <AudioWaveformVisualizer trackRef={audioTrack} state={state} height={120} />
    </div>
  );
}


import { BarVisualizer, useVoiceAssistant } from "@livekit/components-react";

// BarVisualizer + useVoiceAssistant are built for exactly this use case:
// visualizing the agent's speaking state/audio level.
export function AgentVisualizer() {
  const { state, audioTrack } = useVoiceAssistant();

  return (
    <div style={{ height: 100 }}>
      <BarVisualizer state={state} barCount={7} trackRef={audioTrack} />
      <p style={{ textAlign: "center", color: "#64748b", fontSize: 13 }}>
        Agent status: {state}
      </p>
    </div>
  );
}

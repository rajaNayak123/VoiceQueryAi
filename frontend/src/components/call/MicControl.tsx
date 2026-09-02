import { useLocalParticipant } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Button } from "../common/Button";

export function MicControl() {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  async function toggleMic() {
    await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }

  return (
    <Button variant={isMicrophoneEnabled ? "primary" : "secondary"} onClick={toggleMic}>
      {isMicrophoneEnabled ? "Mute mic" : "Unmute mic"}
    </Button>
  );
}

// Referenced for clarity on which publication this controls.
export const MIC_SOURCE = Track.Source.Microphone;

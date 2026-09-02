import { useRoomContext } from "@livekit/components-react";
import { Button } from "../common/Button";

export function EndCallButton({ onEnded }: { onEnded: () => void }) {
  const room = useRoomContext();

  async function handleEndCall() {
    await room.disconnect();
    onEnded();
  }

  return (
    <Button variant="danger" onClick={handleEndCall}>
      End call
    </Button>
  );
}

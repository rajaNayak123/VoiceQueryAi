import { CallRoom } from "../components/call/CallRoom";

interface CallPageProps {
  token: string;
  livekitUrl: string;
  onCallEnded: () => void;
}

export function CallPage({ token, livekitUrl, onCallEnded }: CallPageProps) {
  return (
    <div style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1 style={{ marginBottom: 24 }}>Live conversation</h1>
      <CallRoom token={token} livekitUrl={livekitUrl} onCallEnded={onCallEnded} />
    </div>
  );
}

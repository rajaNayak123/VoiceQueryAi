import { CallRoom } from "../components/call/CallRoom";

interface CallPageProps {
  token: string;
  livekitUrl: string;
  documentId?: string;
  filename?: string;
  onCallEnded: () => void;
}

export function CallPage({
  token,
  livekitUrl,
  documentId,
  filename,
  onCallEnded,
}: CallPageProps) {
  return (
    <div className="call-page-wrapper">
      <CallRoom
        token={token}
        livekitUrl={livekitUrl}
        documentId={documentId}
        filename={filename}
        onCallEnded={onCallEnded}
      />
    </div>
  );
}

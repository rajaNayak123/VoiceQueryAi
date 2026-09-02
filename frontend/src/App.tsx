import { useState } from "react";
import { UploadPage } from "./pages/UploadPage";
import { CallPage } from "./pages/CallPage";

interface SessionInfo {
  token: string;
  livekitUrl: string;
}

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);

  if (session) {
    return (
      <CallPage
        token={session.token}
        livekitUrl={session.livekitUrl}
        onCallEnded={() => setSession(null)}
      />
    );
  }

  return <UploadPage onSessionReady={setSession} />;
}

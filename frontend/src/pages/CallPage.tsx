import { useEffect, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { CallRoom } from "../components/call/CallRoom";
import { createSession, getStatus } from "../api/client";
import { AuroraGridCanvas } from "../components/visualizer/AuroraGridCanvas";

interface CallPageProps {
  token?: string;
  livekitUrl?: string;
  documentId?: string;
  filename?: string;
  onCallEnded?: () => void;
}

export function CallPage({
  token: propToken,
  livekitUrl: propLivekitUrl,
  documentId: propDocumentId,
  filename: propFilename,
  onCallEnded: propOnCallEnded,
}: CallPageProps = {}) {
  const { documentId: paramDocumentId } = useParams<{ documentId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const stateSession = (location.state as {
    token?: string;
    livekitUrl?: string;
    documentId?: string;
    filename?: string;
  } | null);

  const activeDocumentId = propDocumentId || stateSession?.documentId || paramDocumentId;
  const [token, setToken] = useState<string | null>(propToken || stateSession?.token || null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(propLivekitUrl || stateSession?.livekitUrl || null);
  const [filename, setFilename] = useState<string | undefined>(propFilename || stateSession?.filename);
  const [loading, setLoading] = useState<boolean>(!token || !livekitUrl);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If token and livekitUrl are already available, nothing to fetch
    if (token && livekitUrl) {
      setLoading(false);
      return;
    }

    if (!activeDocumentId) {
      setError("No document specified for this call session.");
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function initSession() {
      try {
        setLoading(true);
        setError(null);

        // Fetch session tokens and document details in parallel
        const [session, docStatus] = await Promise.all([
          createSession(activeDocumentId!),
          getStatus(activeDocumentId!).catch(() => null),
        ]);

        if (!isMounted) return;

        setToken(session.token);
        setLivekitUrl(session.livekitUrl);
        if (docStatus && "filename" in docStatus) {
          setFilename((docStatus as any).filename);
        }
      } catch (err: any) {
        if (!isMounted) return;
        setError(err.message || "Failed to initialize voice session.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, [activeDocumentId, token, livekitUrl]);

  const handleCallEnded = () => {
    if (propOnCallEnded) {
      propOnCallEnded();
    } else {
      navigate("/dashboard");
    }
  };

  if (loading) {
    return (
      <div
        className="home-layout"
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.25rem",
          position: "relative",
        }}
      >
        <AuroraGridCanvas />
        <div
          style={{
            position: "relative",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "1rem",
            background: "rgba(15, 23, 42, 0.75)",
            border: "1px solid rgba(99, 102, 241, 0.25)",
            borderRadius: "16px",
            padding: "2.5rem 3rem",
            backdropFilter: "blur(16px)",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              border: "3px solid rgba(99, 102, 241, 0.2)",
              borderTopColor: "#6366f1",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <span style={{ fontSize: "1rem", color: "#f8fafc", fontWeight: 600 }}>
            Connecting to Voice Room...
          </span>
          <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
            Preparing your document and voice agent
          </span>
        </div>
      </div>
    );
  }

  if (error || !token || !livekitUrl) {
    return (
      <div
        className="home-layout"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <AuroraGridCanvas />
        <div
          style={{
            position: "relative",
            zIndex: 10,
            maxWidth: "480px",
            textAlign: "center",
            padding: "2.5rem 2rem",
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "16px",
            backdropFilter: "blur(16px)",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "rgba(239, 68, 68, 0.15)",
              color: "#f87171",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
              fontSize: "1.5rem",
            }}
          >
            ✕
          </div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#f8fafc", marginBottom: "0.75rem" }}>
            Unable to Connect
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.75rem" }}>
            {error || "Could not retrieve voice session parameters."}
          </p>
          <button
            type="button"
            className="btn-header-studio"
            onClick={() => navigate("/dashboard")}
            style={{ padding: "0.75rem 1.5rem", fontSize: "0.9rem" }}
          >
            <span>Return to Document Studio</span>
            <span className="btn-arrow">→</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="call-page-wrapper">
      <CallRoom
        token={token}
        livekitUrl={livekitUrl}
        documentId={activeDocumentId}
        filename={filename}
        onCallEnded={handleCallEnded}
      />
    </div>
  );
}


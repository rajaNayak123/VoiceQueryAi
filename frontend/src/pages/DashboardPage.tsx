import { useEffect, useState } from "react";
import { useUser, UserButton } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { AuroraGridCanvas } from "../components/visualizer/AuroraGridCanvas";
import { UploadDropzone } from "../components/upload/UploadDropzone";
import { ProcessingStatus } from "../components/upload/ProcessingStatus";
import {
  listDocuments,
  deleteDocument,
  createSession,
  type DocumentItem,
} from "../api/client";
import { useDocumentUpload } from "../hooks/useDocumentUpload";
import { useDocumentStatusPoll } from "../hooks/useDocumentStatusPoll";

interface SessionInfo {
  token: string;
  livekitUrl: string;
  documentId?: string;
  filename?: string;
}

interface DashboardPageProps {
  onSessionReady?: (session: SessionInfo) => void;
  onNavigateHome?: () => void;
}

export function DashboardPage({
  onSessionReady,
  onNavigateHome,
}: DashboardPageProps = {}) {
  const navigate = useNavigate();
  const { user } = useUser();
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [startingSessionDocId, setStartingSessionDocId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Ingestion state for newly uploaded document in the dashboard
  const { upload, uploading, error: uploadError } = useDocumentUpload();
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState("");

  const { status, document: polledDoc, error: statusError } = useDocumentStatusPoll(uploadedDocId);

  async function fetchDocs() {
    try {
      setLoadingDocs(true);
      const items = await listDocuments();
      setDocs(items);
    } catch (err: any) {
      console.warn("Failed to load documents:", err);
    } finally {
      setLoadingDocs(false);
    }
  }

  useEffect(() => {
    fetchDocs();
  }, []);

  // When newly uploaded document finishes processing, refresh the list
  useEffect(() => {
    if (status === "ready") {
      fetchDocs();
    }
  }, [status]);

  async function handleFileSelected(file: File) {
    setUploadedFileName(file.name);
    setActionError(null);
    const docId = await upload(file);
    if (docId) {
      setUploadedDocId(docId);
    }
  }

  async function handleStartCall(doc: { id: string; filename?: string }) {
    try {
      setStartingSessionDocId(doc.id);
      setActionError(null);
      const session = await createSession(doc.id);
      const sessionData: SessionInfo = {
        token: session.token,
        livekitUrl: session.livekitUrl,
        documentId: doc.id,
        filename: doc.filename,
      };

      if (onSessionReady) {
        onSessionReady(sessionData);
      } else {
        navigate(`/call/${doc.id}`, { state: sessionData });
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to start voice call");
    } finally {
      setStartingSessionDocId(null);
    }
  }

  async function handleDelete(docId: string) {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      setActionError(null);
      await deleteDocument(docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      if (uploadedDocId === docId) {
        setUploadedDocId(null);
        setUploadedFileName("");
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to delete document");
    }
  }

  const effectiveStatus = status || (uploading ? "uploading" : null);

  const displayName =
    user?.firstName ||
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Explorer";

  return (
    <div className="home-layout">
      {/* Dynamic Aurora Dot Matrix Grid */}
      <AuroraGridCanvas />

      {/* Clean Minimal Header */}
      <header className="home-header">
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <div
            className="home-logo-group"
            style={{ cursor: "pointer" }}
            onClick={() => {
              if (onNavigateHome) {
                onNavigateHome();
              } else {
                navigate("/");
              }
            }}
          >
            <div className="home-logo-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" x2="12" y1="19" y2="22"/>
              </svg>
            </div>
            <span className="home-logo-text">VoiceQuery AI</span>
          </div>
        </div>

        <div className="header-right-group">
          <div className="user-profile-badge">
            <span className="user-display-name">{displayName}</span>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      {/* Centered Clean PDF Upload Main Layout */}
      <main className="dashboard-clean-content">
        <div className="dashboard-upload-hero">
          <h1 className="dashboard-upload-title">
            Upload PDF <span className="hero-gradient-text">Document</span>
          </h1>
          <p className="dashboard-upload-subtitle">
            Upload your document to immediately start a natural voice conversation with real-time page citations.
          </p>
        </div>

        {/* Global Action Error */}
        {(actionError || uploadError || statusError) && (
          <div className="auth-error-banner" style={{ marginBottom: "1.5rem", width: "100%", maxWidth: "780px" }}>
            <span>{actionError || uploadError || statusError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", marginLeft: "auto" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Centered Upload Dropzone Card */}
        <div className="dashboard-upload-card-box">
          {!uploadedDocId ? (
            <UploadDropzone
              onFileSelected={handleFileSelected}
              disabled={uploading}
            />
          ) : (
            <div className="dashboard-processing-box">
              <div className="home-file-badge-row">
                <span className="home-file-pill">PDF</span>
                <span className="home-file-name">{uploadedFileName}</span>
                <button
                  type="button"
                  className="btn-change-file"
                  onClick={() => {
                    setUploadedDocId(null);
                    setUploadedFileName("");
                  }}
                >
                  Upload another
                </button>
              </div>

              {effectiveStatus && (
                <div style={{ margin: "0.5rem 0" }}>
                  <ProcessingStatus
                    status={effectiveStatus}
                    failureReason={polledDoc?.failureReason}
                  />
                </div>
              )}

              {effectiveStatus === "ready" && (
                <button
                  type="button"
                  className="btn-hero-start-voice"
                  disabled={startingSessionDocId === uploadedDocId}
                  onClick={() => {
                    if (uploadedDocId) {
                      handleStartCall({
                        id: uploadedDocId,
                        filename: uploadedFileName,
                      });
                    }
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="22" />
                  </svg>
                  <span>{startingSessionDocId === uploadedDocId ? "Connecting to Voice Room..." : "Start Voice Conversation"}</span>
                  <span className="btn-arrow">→</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Existing Documents Library (Clean, non-intrusive) */}
        {docs.length > 0 && (
          <section className="dashboard-recent-docs-section">
            <h2 className="dashboard-recent-docs-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              <span>Your Uploaded Documents ({docs.length})</span>
            </h2>

            <div className="docs-table-wrapper">
              <div className="docs-list">
                {docs.map((doc) => (
                  <div key={doc.id} className="doc-item-row">
                    <div className="doc-item-info">
                      <div className="doc-item-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                      </div>
                      <div className="doc-item-details">
                        <span className="doc-item-name">{doc.filename}</span>
                        <div className="doc-item-meta">
                          <span>
                            {doc.createdAt
                              ? new Date(doc.createdAt).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                })
                              : "Recently uploaded"}
                          </span>
                          {doc.pageCount && <span>• {doc.pageCount} pages</span>}
                          <span>•</span>
                          <span
                            className={`status-badge-pill ${
                              doc.status === "ready"
                                ? "status-badge-ready"
                                : doc.status === "failed"
                                ? "status-badge-failed"
                                : "status-badge-processing"
                            }`}
                          >
                            {doc.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="doc-item-actions">
                      <button
                        type="button"
                        className="btn-doc-talk"
                        disabled={doc.status !== "ready" || startingSessionDocId === doc.id}
                        onClick={() => handleStartCall(doc)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                          <line x1="12" y1="19" x2="12" y2="22"/>
                        </svg>
                        {startingSessionDocId === doc.id ? "Connecting..." : "Talk with Document"}
                      </button>

                      <button
                        type="button"
                        className="btn-doc-delete"
                        title="Delete document"
                        onClick={() => handleDelete(doc.id)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

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
  uploadDocuments,
  type DocumentItem,
} from "../api/client";
import { useDocumentUpload } from "../hooks/useDocumentUpload";
import { useDocumentStatusPoll } from "../hooks/useDocumentStatusPoll";

interface SessionInfo {
  token: string;
  livekitUrl: string;
  documentId?: string;
  documentIds?: string[];
  documents?: { id: string; filename: string }[];
  filename?: string;
  isComparison?: boolean;
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

  // Multi-document selection for comparison mode
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  // Ingestion state for single or batch newly uploaded documents
  const { upload, uploading, error: uploadError } = useDocumentUpload();
  const [uploadedDocId, setUploadedDocId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState("");

  // Batch upload state
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchUploadedDocs, setBatchUploadedDocs] = useState<{ documentId: string; filename: string; status: string }[]>([]);

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
    setBatchUploadedDocs([]);
    const docId = await upload(file);
    if (docId) {
      setUploadedDocId(docId);
    }
  }

  async function handleBatchFilesSelected(files: File[]) {
    if (files.length === 1) {
      return handleFileSelected(files[0]);
    }
    try {
      setBatchUploading(true);
      setActionError(null);
      setUploadedDocId(null);
      setUploadedFileName("");
      const res = await uploadDocuments(files);
      setBatchUploadedDocs(res.documents);
      fetchDocs();
    } catch (err: any) {
      setActionError(err.message || "Failed to upload multiple files");
    } finally {
      setBatchUploading(false);
    }
  }

  const toggleSelectDoc = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

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
        documentIds: [doc.id],
        documents: [{ id: doc.id, filename: doc.filename || "Document" }],
        isComparison: false,
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

  async function handleStartComparisonCall(docIdsToCompare: string[]) {
    try {
      setStartingSessionDocId("compare");
      setActionError(null);
      const session = await createSession(docIdsToCompare);
      const sessionData: SessionInfo = {
        token: session.token,
        livekitUrl: session.livekitUrl,
        documentId: session.documentId,
        documentIds: session.documentIds || docIdsToCompare,
        documents: session.documents,
        filename: session.filename,
        isComparison: true,
      };

      if (onSessionReady) {
        onSessionReady(sessionData);
      } else {
        navigate(`/call/compare`, { state: sessionData });
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to start comparison voice call");
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
      setSelectedDocIds((prev) => prev.filter((d) => d !== docId));
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
        )}        {/* Centered Upload Dropzone Card */}
        <div className="dashboard-upload-card-box">
          {!uploadedDocId && batchUploadedDocs.length === 0 ? (
            <UploadDropzone
              onFileSelected={handleFileSelected}
              onFilesSelected={handleBatchFilesSelected}
              disabled={uploading || batchUploading}
            />
          ) : batchUploadedDocs.length > 0 ? (
            <div className="dashboard-processing-box">
              <div className="home-file-badge-row">
                <span className="home-file-pill" style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)", color: "#fff" }}>
                  Multi-Doc
                </span>
                <span className="home-file-name">
                  {batchUploadedDocs.length} Documents Uploaded for Comparison
                </span>
                <button
                  type="button"
                  className="btn-change-file"
                  onClick={() => {
                    setBatchUploadedDocs([]);
                    setUploadedDocId(null);
                  }}
                >
                  Upload different files
                </button>
              </div>

              <div className="batch-docs-status-list">
                {batchUploadedDocs.map((d, idx) => (
                  <div key={d.documentId} className="batch-doc-item-preview">
                    <span className="batch-doc-tag">Doc {String.fromCharCode(65 + idx)}</span>
                    <span className="batch-doc-title">{d.filename}</span>
                    <span className="status-badge-pill status-badge-ready">indexed</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="btn-hero-start-voice"
                disabled={startingSessionDocId === "compare"}
                onClick={() =>
                  handleStartComparisonCall(batchUploadedDocs.map((d) => d.documentId))
                }
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
                <span>
                  {startingSessionDocId === "compare"
                    ? "Connecting to Voice Room..."
                    : "Start Multi-Document Comparison Call"}
                </span>
                <span className="btn-arrow">→</span>
              </button>
            </div>
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

        {/* Multi-Document Sticky Selection Banner */}
        {selectedDocIds.length >= 2 && (
          <div className="comparison-sticky-banner">
            <div className="comparison-banner-info">
              <span className="comparison-badge-icon">⚡</span>
              <div>
                <strong className="comparison-banner-title">Multi-Document Comparison Active</strong>
                <p className="comparison-banner-desc">
                  {selectedDocIds.length} documents selected for cross-document synthesis & comparison
                </p>
              </div>
            </div>
            <div className="comparison-banner-actions">
              <button
                type="button"
                className="btn-clear-selection"
                onClick={() => setSelectedDocIds([])}
              >
                Clear Selection
              </button>
              <button
                type="button"
                className="btn-launch-comparison"
                disabled={startingSessionDocId === "compare"}
                onClick={() => handleStartComparisonCall(selectedDocIds)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
                <span>
                  {startingSessionDocId === "compare"
                    ? "Connecting..."
                    : `Compare ${selectedDocIds.length} Documents Voice Call`}
                </span>
                <span className="btn-arrow">→</span>
              </button>
            </div>
          </div>
        )}

        {/* Existing Documents Library */}
        {docs.length > 0 && (
          <section className="dashboard-recent-docs-section">
            <div className="dashboard-docs-header-row">
              <h2 className="dashboard-recent-docs-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                <span>Your Uploaded Documents ({docs.length})</span>
              </h2>

              <p className="dashboard-compare-tip">
                Tip: Check 2 or more documents to start <strong>"Compare Doc A vs Doc B"</strong> mode
              </p>
            </div>

            <div className="docs-table-wrapper">
              <div className="docs-list">
                {docs.map((doc) => {
                  const isSelected = selectedDocIds.includes(doc.id);
                  return (
                    <div
                      key={doc.id}
                      className={`doc-item-row ${isSelected ? "is-selected-for-compare" : ""}`}
                    >
                      {/* Checkbox Selector for Comparison Mode */}
                      <button
                        type="button"
                        className={`doc-item-select-checkbox ${isSelected ? "is-checked" : ""}`}
                        onClick={() => toggleSelectDoc(doc.id)}
                        title={
                          isSelected
                            ? "Deselect from comparison"
                            : "Select to compare with other documents"
                        }
                      >
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>

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
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

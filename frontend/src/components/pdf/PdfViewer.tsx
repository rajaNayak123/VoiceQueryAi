import { useEffect, useRef, useState } from "react";
import { Viewer, Worker } from "@react-pdf-viewer/core";
import { highlightPlugin, type RenderHighlightsProps } from "@react-pdf-viewer/highlight";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/highlight/lib/styles/index.css";
import type { Citation } from "../../types";
import { getAuthHeaders } from "../../api/client";

interface PdfViewerProps {
  fileUrl: string;
  filename?: string;
  citations: Citation[];
  selectedCitation: Citation | null;
  agentSpeaking: boolean;
}

export function PdfViewer({
  fileUrl,
  filename = "Document",
  citations = [],
  selectedCitation = null,
  agentSpeaking = false,
}: PdfViewerProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Use refs so renderHighlights callback always accesses fresh state safely
  const citationsRef = useRef<Citation[]>(citations || []);
  citationsRef.current = citations || [];

  const selectedCitationRef = useRef<Citation | null>(selectedCitation);
  selectedCitationRef.current = selectedCitation;

  const agentSpeakingRef = useRef<boolean>(agentSpeaking);
  agentSpeakingRef.current = agentSpeaking;

  // Highlight plugin must be called at top level of component (it is a hook internally)
  const highlightPluginInstance = highlightPlugin({
    renderHighlights: (props: RenderHighlightsProps) => {
      const currentCitations = citationsRef.current;
      const currentSelected = selectedCitationRef.current;
      const currentSpeaking = agentSpeakingRef.current;

      const pageHighlights = currentCitations.filter(
        (c) => c.pageIndex === props.pageIndex || c.page - 1 === props.pageIndex
      );

      if (pageHighlights.length === 0) {
        return <div />;
      }

      return (
        <div key={`page-highlights-${props.pageIndex}`}>
          {pageHighlights.map((citation) => {
            const isSelected = currentSelected?.id === citation.id;
            const isSpeakingThis = isSelected && currentSpeaking;

            // Render line boxes if available, or fall back to overall bounding box
            const areasToRender =
              citation.boxes && citation.boxes.length > 0
                ? citation.boxes
                : citation.bbox
                ? [citation.bbox]
                : [];

            const typeClass = `highlight-type-${citation.contentType || "text"}`;
            const typeLabel =
              citation.contentType === "table"
                ? "Table"
                : citation.contentType === "diagram"
                ? "Diagram"
                : "Speaking";

            return areasToRender.map((area, idx) => {
              const css = props.getCssProperties(area, props.rotation);
              return (
                <div
                  key={`${citation.id}-box-${idx}`}
                  className={`pdf-citation-highlight ${typeClass} ${
                    isSelected ? "is-selected" : ""
                  } ${isSpeakingThis ? "is-speaking" : ""}`}
                  style={{
                    ...css,
                    position: "absolute",
                    borderRadius: 3,
                    transition: "all 0.25s ease-in-out",
                    pointerEvents: "auto",
                    cursor: "pointer",
                  }}
                  title={`Page ${citation.page} [${citation.contentType || "text"}]: ${citation.snippet.slice(0, 80)}...`}
                >
                  {idx === 0 && isSpeakingThis && (
                    <span className={`speaking-badge badge-type-${citation.contentType || "text"}`}>
                      <span className="speaking-dot" />
                      {typeLabel}
                    </span>
                  )}
                </div>
              );
            });
          })}
        </div>
      );
    },
  });

  const { jumpToHighlightArea } = highlightPluginInstance;


  // Auto-jump to the citation when selectedCitation updates or agent starts speaking
  useEffect(() => {
    if (!selectedCitation) return;
    const targetArea = selectedCitation.bbox || selectedCitation.boxes?.[0];
    if (targetArea && jumpToHighlightArea) {
      try {
        jumpToHighlightArea({
          pageIndex: targetArea.pageIndex,
          left: targetArea.left,
          top: targetArea.top,
          width: targetArea.width,
          height: targetArea.height,
        });
      } catch {
        // Safe fallback if viewer is still initializing layout
      }
    }
  }, [selectedCitation, jumpToHighlightArea]);

  // Authenticated fetch for PDF binary data
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    async function loadPdf() {
      if (!fileUrl) return;
      setIsLoading(true);
      setLoadError(null);

      // If already a local blob/data URL, use directly
      if (fileUrl.startsWith("blob:") || fileUrl.startsWith("data:")) {
        setResolvedUrl(fileUrl);
        setIsLoading(false);
        return;
      }

      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch(fileUrl, {
          headers: {
            ...authHeaders,
          },
        });

        if (!res.ok) {
          throw new Error(`Server returned status ${res.status} (${res.statusText || "Unauthorized"})`);
        }

        const blob = await res.blob();
        if (!active) return;

        objectUrl = URL.createObjectURL(blob);
        setResolvedUrl(objectUrl);
      } catch (err: any) {
        if (active) {
          setLoadError(err.message || "Failed to load PDF file.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileUrl]);

  return (
    <div className="pdf-viewer-container">
      <div className="pdf-viewer-header">
        <div className="pdf-title-badge">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="pdf-filename">{filename}</span>
        </div>

        <div className="pdf-status-indicators">
          {agentSpeaking && selectedCitation && (
            <div className="live-speech-pill">
              <span className="pulse-ring" />
              <span className="pulse-core" />
              <span>Voice citing Page {selectedCitation.page}</span>
            </div>
          )}
        </div>
      </div>

      <div className="pdf-viewer-canvas-wrapper">
        {isLoading && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 16,
            color: "#94a3b8"
          }}>
            <div style={{
              width: 36,
              height: 36,
              border: "3px solid rgba(255, 255, 255, 0.1)",
              borderTopColor: "#38bdf8",
              borderRadius: "50%",
              animation: "spin 1s linear infinite"
            }} />
            <span style={{ fontSize: "0.95rem" }}>Loading document preview...</span>
          </div>
        )}

        {loadError && !isLoading && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 14,
            padding: 24,
            textAlign: "center"
          }}>
            <div style={{
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
              borderRadius: 8,
              padding: "16px 24px",
              maxWidth: 480
            }}>
              <p style={{ fontWeight: 600, margin: "0 0 8px" }}>Could not load PDF</p>
              <p style={{ fontSize: "0.88rem", margin: 0, opacity: 0.85 }}>{loadError}</p>
            </div>
          </div>
        )}

        {!isLoading && !loadError && resolvedUrl && (
          <Worker workerUrl="/pdf.worker.min.js">
            <Viewer
              fileUrl={resolvedUrl}
              plugins={[highlightPluginInstance]}
              initialPage={selectedCitation ? selectedCitation.pageIndex : 0}
            />
          </Worker>
        )}
      </div>
    </div>
  );
}

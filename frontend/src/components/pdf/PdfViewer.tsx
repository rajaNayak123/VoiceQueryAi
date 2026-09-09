import { useEffect, useMemo } from "react";
import { Viewer, Worker } from "@react-pdf-viewer/core";
import { highlightPlugin, type RenderHighlightsProps } from "@react-pdf-viewer/highlight";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/highlight/lib/styles/index.css";
import type { Citation } from "../../types";

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
  citations,
  selectedCitation,
  agentSpeaking,
}: PdfViewerProps) {
  // Highlight plugin configuration
  const highlightPluginInstance = useMemo(() => {
    return highlightPlugin({
      renderHighlights: (props: RenderHighlightsProps) => {
        const pageHighlights = citations.filter(
          (c) => c.pageIndex === props.pageIndex || c.page - 1 === props.pageIndex
        );

        if (pageHighlights.length === 0) {
          return <div />;
        }

        return (
          <div key={`page-highlights-${props.pageIndex}`}>
            {pageHighlights.map((citation) => {
              const isSelected = selectedCitation?.id === citation.id;
              const isSpeakingThis = isSelected && agentSpeaking;

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
  }, [citations, selectedCitation, agentSpeaking]);

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
        <Worker workerUrl="/pdf.worker.min.js">
          <Viewer
            fileUrl={fileUrl}
            plugins={[highlightPluginInstance]}
            initialPage={selectedCitation ? selectedCitation.pageIndex : 0}
          />
        </Worker>
      </div>
    </div>
  );
}

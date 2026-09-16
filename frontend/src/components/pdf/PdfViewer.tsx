import { useEffect, useRef, useState } from "react";
import { Viewer, Worker, type Plugin, type PluginFunctions } from "@react-pdf-viewer/core";
import { highlightPlugin, type RenderHighlightsProps } from "@react-pdf-viewer/highlight";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/highlight/lib/styles/index.css";
import type { Citation, SpotlightPayload } from "../../types";
import { getAuthHeaders } from "../../api/client";

interface PdfViewerProps {
  fileUrl: string;
  filename?: string;
  citations: Citation[];
  selectedCitation: Citation | null;
  activeSpotlight?: SpotlightPayload | null;
  agentSpeaking: boolean;
  onSelectCitation?: (citation: Citation) => void;
}

interface FollowAlongPluginInstance extends Plugin {
  jumpToPage: (pageIndex: number) => Promise<void>;
  scrollToSpotlight: (pageIndex: number, targetTopPercent?: number) => boolean;
  getPagesContainer: () => HTMLElement | null;
}

function createFollowAlongPlugin(): FollowAlongPluginInstance {
  let pluginFunctions: PluginFunctions | null = null;

  return {
    install(functions: PluginFunctions) {
      pluginFunctions = functions;
    },
    uninstall() {
      pluginFunctions = null;
    },
    getPagesContainer() {
      return pluginFunctions?.getPagesContainer() || null;
    },
    jumpToPage: async (pageIndex: number) => {
      if (pluginFunctions) {
        await pluginFunctions.jumpToPage(pageIndex);
      }
    },
    scrollToSpotlight: (pageIndex: number, targetTopPercent = 25): boolean => {
      if (!pluginFunctions) return false;
      try {
        const pagesContainer = pluginFunctions.getPagesContainer();
        if (!pagesContainer) {
          pluginFunctions.jumpToPage(pageIndex);
          return true;
        }

        // Locate page layer in container DOM
        const innerPages = pagesContainer.querySelectorAll(".rpv-core__inner-page");
        const pageLayers = pagesContainer.querySelectorAll(".rpv-core__page-layer");
        const targetPage = (innerPages[pageIndex] || pageLayers[pageIndex]) as HTMLElement | undefined;

        if (targetPage) {
          const containerRect = pagesContainer.getBoundingClientRect();
          const targetRect = targetPage.getBoundingClientRect();
          const pageHeight = targetPage.offsetHeight || targetRect.height;
          const safePercent = Math.max(0, Math.min(100, targetTopPercent));
          const offsetWithinPage = (safePercent / 100) * pageHeight;

          // Target positioned in upper-third of viewer for optimal reading context
          const currentScroll = pagesContainer.scrollTop;
          const relativeTop = targetRect.top - containerRect.top;
          const targetScrollTop =
            currentScroll + relativeTop + offsetWithinPage - containerRect.height * 0.28;

          pagesContainer.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: "smooth",
          });
          return true;
        } else {
          // If virtualized page element isn't in DOM yet, request core jump
          pluginFunctions.jumpToPage(pageIndex);
          return false;
        }
      } catch {
        pluginFunctions?.jumpToPage(pageIndex);
        return false;
      }
    },
  };
}

export function PdfViewer({
  fileUrl,
  filename = "Document",
  citations = [],
  selectedCitation = null,
  activeSpotlight = null,
  agentSpeaking = false,
  onSelectCitation,
}: PdfViewerProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [followAlongEnabled, setFollowAlongEnabled] = useState<boolean>(true);

  // Use refs so renderHighlights and async scrolls always access fresh state safely
  const citationsRef = useRef<Citation[]>(citations || []);
  citationsRef.current = citations || [];

  const selectedCitationRef = useRef<Citation | null>(selectedCitation);
  selectedCitationRef.current = selectedCitation;

  const activeSpotlightRef = useRef<SpotlightPayload | null>(activeSpotlight);
  activeSpotlightRef.current = activeSpotlight;

  const agentSpeakingRef = useRef<boolean>(agentSpeaking);
  agentSpeakingRef.current = agentSpeaking;

  // Custom follow-along plugin instance
  const followAlongPluginRef = useRef<FollowAlongPluginInstance | null>(null);
  if (!followAlongPluginRef.current) {
    followAlongPluginRef.current = createFollowAlongPlugin();
  }

  // Highlight plugin must be called at top level of component
  const highlightPluginInstance = highlightPlugin({
    renderHighlights: (props: RenderHighlightsProps) => {
      const currentCitations = citationsRef.current;
      const currentSelected = selectedCitationRef.current;
      const currentSpotlight = activeSpotlightRef.current;
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
            const isSpotlight =
              Boolean(currentSpotlight?.citationId && currentSpotlight.citationId === citation.id) ||
              (Boolean(currentSpotlight) &&
                (currentSpotlight!.pageIndex === props.pageIndex ||
                  currentSpotlight!.page_number - 1 === props.pageIndex) &&
                (isSelected || currentSpeaking || currentSpotlight!.agentSpeaking));

            const isSpeakingThis =
              (isSelected && currentSpeaking) ||
              (isSpotlight && (currentSpeaking || currentSpotlight?.agentSpeaking));

            // Render line boxes if available, or fall back to overall bounding box
            const areasToRender =
              citation.boxes && citation.boxes.length > 0
                ? citation.boxes
                : citation.coordinates
                ? [citation.coordinates]
                : citation.bbox
                ? [citation.bbox]
                : [];

            const typeClass = `highlight-type-${citation.contentType || "text"}`;
            const typeLabel =
              citation.section
                ? citation.section
                : citation.contentType === "table"
                ? "Table"
                : citation.contentType === "diagram"
                ? "Diagram"
                : "Spotlight";

            return areasToRender.map((area, idx) => {
              const css = props.getCssProperties(area, props.rotation);
              return (
                <div
                  key={`${citation.id}-box-${idx}`}
                  className={`pdf-citation-highlight ${typeClass} ${
                    isSelected ? "is-selected" : ""
                  } ${isSpotlight ? "is-spotlight" : ""} ${isSpeakingThis ? "is-speaking" : ""}`}
                  style={{
                    ...css,
                    position: "absolute",
                    borderRadius: 4,
                    transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                    pointerEvents: "auto",
                    cursor: "pointer",
                  }}
                  onClick={() => onSelectCitation?.(citation)}
                  title={`Page ${citation.page} [${citation.contentType || "text"}]: ${citation.snippet.slice(
                    0,
                    80
                  )}...`}
                >
                  {/* Glowing Spotlight Radar Pulse Ring */}
                  {idx === 0 && isSpeakingThis && (
                    <div className="spotlight-pulse-aura" />
                  )}

                  {/* Multimodal Follow-Along Pill Badge */}
                  {idx === 0 && (isSpeakingThis || isSpotlight) && (
                    <span
                      className={`speaking-badge ${
                        isSpeakingThis ? "is-live" : ""
                      } badge-type-${citation.contentType || "text"}`}
                    >
                      <span className="speaking-wave-icon">
                        <span className="bar bar-1" />
                        <span className="bar bar-2" />
                        <span className="bar bar-3" />
                      </span>
                      <span>
                        Page {citation.page} • {typeLabel}
                      </span>
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

  // Auto-Focus "Follow Along" trigger: Smoothly scroll to page and coordinates
  useEffect(() => {
    if (!followAlongEnabled) return;

    // Determine target page index & top offset from activeSpotlight or selectedCitation
    let targetPageIndex: number | null = null;
    let targetTopPercent = 25;
    let fallbackArea = null;

    if (activeSpotlight) {
      targetPageIndex =
        activeSpotlight.pageIndex ??
        (activeSpotlight.page_number ? activeSpotlight.page_number - 1 : 0);
      if (activeSpotlight.coordinates) {
        targetTopPercent = activeSpotlight.coordinates.top;
        fallbackArea = activeSpotlight.coordinates;
      }
    } else if (selectedCitation) {
      targetPageIndex =
        selectedCitation.pageIndex ??
        (selectedCitation.page ? selectedCitation.page - 1 : 0);
      const coords =
        selectedCitation.coordinates || selectedCitation.bbox || selectedCitation.boxes?.[0];
      if (coords) {
        targetTopPercent = coords.top;
        fallbackArea = coords;
      }
    }

    if (targetPageIndex === null || targetPageIndex < 0) return;

    const plugin = followAlongPluginRef.current;
    if (!plugin) return;

    // 1. First attempt smooth scroll via custom follow-along plugin
    const scrolled = plugin.scrollToSpotlight(targetPageIndex, targetTopPercent);

    // 2. If virtualized page hasn't mounted in DOM yet, retry with staggered delays
    if (!scrolled) {
      const timer1 = setTimeout(() => {
        plugin.scrollToSpotlight(targetPageIndex!, targetTopPercent);
      }, 90);

      const timer2 = setTimeout(() => {
        plugin.scrollToSpotlight(targetPageIndex!, targetTopPercent);
      }, 280);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }

    // 3. Fallback jumpToHighlightArea if layout engine needs assist
    if (fallbackArea && jumpToHighlightArea) {
      try {
        jumpToHighlightArea({
          pageIndex: fallbackArea.pageIndex,
          left: fallbackArea.left,
          top: fallbackArea.top,
          width: fallbackArea.width,
          height: fallbackArea.height,
        });
      } catch {
        // Safe fallback if layout engine is busy
      }
    }
  }, [
    activeSpotlight?.timestamp,
    activeSpotlight?.page_number,
    activeSpotlight?.pageIndex,
    selectedCitation?.id,
    followAlongEnabled,
    jumpToHighlightArea,
  ]);

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
          throw new Error(
            `Server returned status ${res.status} (${res.statusText || "Unauthorized"})`
          );
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

  // Active page number to display
  const activePageDisplay =
    activeSpotlight?.page_number ||
    (activeSpotlight ? activeSpotlight.pageIndex + 1 : null) ||
    selectedCitation?.page ||
    (selectedCitation ? selectedCitation.pageIndex + 1 : null);

  const activeSectionDisplay =
    activeSpotlight?.section || selectedCitation?.section || null;

  return (
    <div className="pdf-viewer-container">
      {/* Viewer Header */}
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
          {/* Follow Along Toggle Switch */}
          <button
            type="button"
            className={`follow-along-toggle-btn ${followAlongEnabled ? "is-active" : ""}`}
            onClick={() => setFollowAlongEnabled((prev) => !prev)}
            title={
              followAlongEnabled
                ? "Auto-Focus Follow Along is ON (Click to unlock viewport)"
                : "Auto-Focus Follow Along is PAUSED (Click to lock to agent voice)"
            }
          >
            <span className="toggle-indicator-dot" />
            <span className="toggle-label">Follow Along</span>
            <span className="toggle-status">{followAlongEnabled ? "ON" : "OFF"}</span>
          </button>

          {/* Real-time Voice Spotlight Indicator */}
          {agentSpeaking && activePageDisplay && (
            <div className="live-speech-pill spotlight-pulse">
              <span className="pulse-ring" />
              <span className="pulse-core" />
              <span>
                Voice citing Page {activePageDisplay}
                {activeSectionDisplay ? ` • ${activeSectionDisplay}` : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* PDF Canvas Container */}
      <div className="pdf-viewer-canvas-wrapper">
        {isLoading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 16,
              color: "#94a3b8",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                border: "3px solid rgba(255, 255, 255, 0.1)",
                borderTopColor: "#38bdf8",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            <span style={{ fontSize: "0.95rem" }}>Loading document preview...</span>
          </div>
        )}

        {loadError && !isLoading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 14,
              padding: 24,
              textAlign: "center",
            }}
          >
            <div
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#fca5a5",
                borderRadius: 8,
                padding: "16px 24px",
                maxWidth: 480,
              }}
            >
              <p style={{ fontWeight: 600, margin: "0 0 8px" }}>Could not load PDF</p>
              <p style={{ fontSize: "0.88rem", margin: 0, opacity: 0.85 }}>{loadError}</p>
            </div>
          </div>
        )}

        {!isLoading && !loadError && resolvedUrl && (
          <Worker workerUrl="/pdf.worker.min.js">
            <Viewer
              fileUrl={resolvedUrl}
              plugins={[highlightPluginInstance, followAlongPluginRef.current!]}
              initialPage={selectedCitation ? selectedCitation.pageIndex : 0}
            />
          </Worker>
        )}
      </div>
    </div>
  );
}

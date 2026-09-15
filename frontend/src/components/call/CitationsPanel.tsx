import type { Citation } from "../../types";

interface CitationsPanelProps {
  citations: Citation[];
  allCitations: Citation[];
  selectedCitation: Citation | null;
  agentSpeaking: boolean;
  onSelectCitation: (citation: Citation) => void;
}

export function CitationsPanel({
  citations,
  allCitations,
  selectedCitation,
  agentSpeaking,
  onSelectCitation,
}: CitationsPanelProps) {
  const displayList = citations.length > 0 ? citations : allCitations;

  return (
    <div className="citations-panel">
      <div className="citations-header">
        <div className="citations-title-wrapper">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="citations-title">Document Citations</span>
        </div>
        {displayList.length > 0 && (
          <span className="citations-count-badge">
            {displayList.length} {displayList.length === 1 ? "source" : "sources"}
          </span>
        )}
      </div>

      <div className="citations-list">
        {displayList.length === 0 ? (
          <div className="citations-empty-state">
            <div className="citations-empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#64748b" }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <p className="citations-empty-text">
              Ask a question about the document to hear answers and see real-time paragraph highlights.
            </p>
          </div>
        ) : (
          displayList.map((citation, index) => {
            const isSelected = selectedCitation?.id === citation.id;
            const isSpeakingThis = isSelected && agentSpeaking;

            return (
              <div
                key={citation.id || `cit-${index}`}
                className={`citation-card ${isSelected ? "is-selected" : ""} ${
                  isSpeakingThis ? "is-speaking" : ""
                }`}
                onClick={() => onSelectCitation(citation)}
              >
                <div className="citation-card-header">
                  <div className="citation-badges-group">
                    <span className="citation-page-badge">
                      Page {citation.page}
                    </span>
                    {citation.contentType === "table" && (
                      <span className="citation-artifact-badge badge-table">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <line x1="3" y1="9" x2="21" y2="9" />
                          <line x1="3" y1="15" x2="21" y2="15" />
                          <line x1="9" y1="3" x2="9" y2="21" />
                        </svg>
                        <span>Table</span>
                      </span>
                    )}
                    {citation.contentType === "diagram" && (
                      <span className="citation-artifact-badge badge-diagram">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        <span>Diagram</span>
                      </span>
                    )}
                    {citation.section && (
                      <span className="citation-section-badge" title={citation.section}>
                        {citation.section.split(" > ").pop()}
                      </span>
                    )}
                  </div>
                  {isSpeakingThis && (
                    <span className="citation-speaking-indicator">
                      <span className="wave-bar" />
                      <span className="wave-bar" />
                      <span className="wave-bar" />
                      Active
                    </span>
                  )}
                </div>

                <p className="citation-snippet">"{citation.snippet}"</p>

                <div className="citation-footer">
                  <button
                    type="button"
                    className="citation-jump-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectCitation(citation);
                    }}
                  >
                    Jump to paragraph
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

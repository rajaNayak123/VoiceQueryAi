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
            <div className="citations-empty-icon">📄</div>
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
                        📊 Table
                      </span>
                    )}
                    {citation.contentType === "diagram" && (
                      <span className="citation-artifact-badge badge-diagram">
                        🖼️ Diagram
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

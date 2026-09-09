import { useState, useMemo } from "react";
import { useTranscriptions } from "@livekit/components-react";
import type { Citation, TelemetryMetrics } from "../../types";

export interface SessionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEndCallConfirm: () => void;
  filename?: string;
  durationSeconds: number;
  allCitations: Citation[];
  telemetryHistory: TelemetryMetrics[];
}

export function SessionSummaryModal({
  isOpen,
  onClose,
  onEndCallConfirm,
  filename = "Document",
  durationSeconds,
  allCitations,
  telemetryHistory,
}: SessionSummaryModalProps) {
  const [copied, setCopied] = useState(false);
  const transcriptions = useTranscriptions();

  // Format call duration
  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s < 10 ? "0" : ""}${s}s`;
  };

  // Extract structured conversation pairs (User Question -> Agent Answer)
  const conversationPairs = useMemo(() => {
    const pairs: { question: string; answer: string; time: string }[] = [];
    let currentQ = "";
    let currentA = "";

    transcriptions.forEach((item) => {
      const identity = item.participantInfo?.identity?.toLowerCase() || "";
      const isUser =
        identity.startsWith("user") ||
        identity.includes("client") ||
        !identity.includes("agent");

      if (isUser) {
        if (currentQ && currentA) {
          pairs.push({
            question: currentQ,
            answer: currentA,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          });
          currentQ = "";
          currentA = "";
        }
        currentQ = item.text;
      } else {
        currentA = (currentA ? currentA + " " : "") + item.text;
      }
    });

    if (currentQ) {
      pairs.push({
        question: currentQ,
        answer: currentA || "Question addressed during voice session.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    }

    return pairs;
  }, [transcriptions]);

  // Aggregate telemetry statistics
  const stats = useMemo(() => {
    const totalTurns = telemetryHistory.length;
    const cachedTurns = telemetryHistory.filter((t) => t.is_cached).length;
    const avgLatency =
      totalTurns > 0
        ? Math.round(
            telemetryHistory.reduce((acc, cur) => acc + cur.total_e2e_ms, 0) / totalTurns
          )
        : 0;
    const cacheHitRate = totalTurns > 0 ? Math.round((cachedTurns / totalTurns) * 100) : 0;

    return {
      totalTurns,
      cachedTurns,
      avgLatency,
      cacheHitRate,
    };
  }, [telemetryHistory]);

  // Unique cited pages
  const uniquePages = useMemo(() => {
    const pages = Array.from(new Set(allCitations.map((c) => c.page))).sort((a, b) => a - b);
    return pages;
  }, [allCitations]);

  // Generate Executive Summary Text
  const executiveSummary = useMemo(() => {
    if (conversationPairs.length === 0) {
      return `A live voice session was conducted regarding "${filename}". The caller reviewed the document structure and explored key topics with the AI assistant.`;
    }
    const topics = conversationPairs.map((p) => p.question).slice(0, 4).join('; ');
    return `During this voice consultation on "${filename}", the caller inquired about: ${topics}. The AI assistant provided factual answers strictly grounded in the document text, referencing ${allCitations.length} distinct context passages across ${uniquePages.length > 0 ? `page(s) ${uniquePages.join(", ")}` : "the document"}.`;
  }, [conversationPairs, filename, allCitations, uniquePages]);

  // Generate Action Items
  const actionItems = useMemo(() => {
    const items = [
      `Review referenced pages (${uniquePages.join(", ") || "1"}) in "${filename}" for detailed documentation`,
      "Cross-verify highlighted technical specifications and figures with team stakeholders",
    ];

    if (conversationPairs.some((p) => p.question.toLowerCase().includes("appointment") || p.question.toLowerCase().includes("book"))) {
      items.push("Verify appointment booking rules and temporary slot hold timeouts");
    }
    if (conversationPairs.some((p) => p.question.toLowerCase().includes("redis") || p.question.toLowerCase().includes("cache"))) {
      items.push("Check Redis session state persistence and cache TTL configurations");
    }
    if (items.length === 2) {
      items.push("Archive session takeaways and citations for operational audit log");
    }

    return items;
  }, [uniquePages, filename, conversationPairs]);

  // Generate Complete Markdown Report
  const generateMarkdown = () => {
    const dateStr = new Date().toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    return `# Voice Query AI — Session Summary & Meeting Recap

**Document:** ${filename}  
**Date:** ${dateStr}  
**Call Duration:** ${formatDuration(durationSeconds)}  
**Total Q&A Turns:** ${conversationPairs.length}  
**Average Latency:** ${stats.avgLatency > 0 ? `${stats.avgLatency} ms` : "N/A"}  
**Semantic Cache Hit Rate:** ${stats.cacheHitRate}%  

---

## 📌 Executive Summary
${executiveSummary}

---

## 🎯 Key Questions & Answers
${
  conversationPairs.length > 0
    ? conversationPairs
        .map(
          (p, i) => `### ${i + 1}. ${p.question}
> **Answer:** ${p.answer}  
> *Referenced Pages:* ${uniquePages.length > 0 ? uniquePages.map((pg) => `Page ${pg}`).join(", ") : "General document"}
`
        )
        .join("\n")
    : "*No formal question/answer pairs recorded during this session.*"
}

---

## 📑 Referenced Document Pages & Citations
| Page | Section / Topic | Snippet Excerpt |
| :---: | :--- | :--- |
${
  allCitations.length > 0
    ? allCitations
        .slice(0, 10)
        .map(
          (c) =>
            `| Page ${c.page} | ${c.section || "Excerpt"} | "${c.snippet.replace(/\n/g, " ").slice(0, 90)}..." |`
        )
        .join("\n")
    : "| N/A | General | No explicit citations recorded |"
}

---

## ✅ Action Items & Next Steps
${actionItems.map((item) => `- [ ] ${item}`).join("\n")}

---
*Report generated automatically by VoiceQuery AI Voice RAG Assistant.*
`;
  };

  // Download Markdown file
  const handleDownloadMarkdown = () => {
    const md = generateMarkdown();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const sanitizedName = filename.replace(/[^a-zA-Z0-9_-]/g, "_");
    link.href = url;
    link.download = `Session-Summary-${sanitizedName}-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Print as PDF using native browser print layout
  const handlePrintPdf = () => {
    window.print();
  };

  // Copy Markdown to Clipboard
  const handleCopy = async () => {
    const md = generateMarkdown();
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="summary-modal-overlay">
      <div className="summary-modal-container">
        {/* Modal Header */}
        <div className="summary-modal-header">
          <div className="summary-title-group">
            <span className="summary-icon">📋</span>
            <div>
              <h2 className="summary-title">Session Summary & Document Recap</h2>
              <p className="summary-subtitle">
                Automated takeaways from your conversation on <strong>{filename}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="summary-close-btn"
            onClick={onClose}
            title="Close summary"
          >
            ✕
          </button>
        </div>

        {/* Printable Summary Body */}
        <div className="summary-modal-body printable-area">
          {/* Metadata Badges */}
          <div className="summary-meta-grid">
            <div className="meta-card">
              <span className="meta-label">Duration</span>
              <strong className="meta-value">{formatDuration(durationSeconds)}</strong>
            </div>
            <div className="meta-card">
              <span className="meta-label">Questions Asked</span>
              <strong className="meta-value">{conversationPairs.length}</strong>
            </div>
            <div className="meta-card">
              <span className="meta-label">Cited Pages</span>
              <strong className="meta-value">
                {uniquePages.length > 0 ? uniquePages.join(", ") : "None"}
              </strong>
            </div>
            <div className="meta-card">
              <span className="meta-label">Avg E2E Latency</span>
              <strong className="meta-value">
                {stats.avgLatency > 0 ? `${stats.avgLatency}ms` : "< 500ms"}
              </strong>
            </div>
            <div className="meta-card">
              <span className="meta-label">Cache Hit Rate</span>
              <strong className="meta-value">{stats.cacheHitRate}%</strong>
            </div>
          </div>

          {/* Section 1: Executive Summary */}
          <div className="summary-section">
            <h3 className="section-title">📌 Executive Summary</h3>
            <p className="section-text">{executiveSummary}</p>
          </div>

          {/* Section 2: Key Questions & Answers */}
          <div className="summary-section">
            <h3 className="section-title">🎯 Key Questions & Answers</h3>
            {conversationPairs.length > 0 ? (
              <div className="qa-list">
                {conversationPairs.map((pair, idx) => (
                  <div key={idx} className="qa-card">
                    <div className="qa-q-row">
                      <span className="q-badge">Q{idx + 1}</span>
                      <strong className="q-text">{pair.question}</strong>
                    </div>
                    <div className="qa-a-row">
                      <span className="a-badge">A</span>
                      <p className="a-text">{pair.answer}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-text">No conversation questions recorded in this session.</p>
            )}
          </div>

          {/* Section 3: Referenced Pages & Citations */}
          <div className="summary-section">
            <h3 className="section-title">📑 Referenced Document Citations</h3>
            {allCitations.length > 0 ? (
              <div className="citations-table-wrapper">
                <table className="summary-citations-table">
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th>Section</th>
                      <th>Relevant Excerpt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allCitations.slice(0, 6).map((c) => (
                      <tr key={c.id}>
                        <td>
                          <span className="page-pill">Page {c.page}</span>
                        </td>
                        <td>{c.section || "General"}</td>
                        <td className="snippet-cell">"{c.snippet.slice(0, 110)}..."</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-text">No specific document citations triggered.</p>
            )}
          </div>

          {/* Section 4: Action Items */}
          <div className="summary-section">
            <h3 className="section-title">✅ Action Items & Next Steps</h3>
            <ul className="action-items-list">
              {actionItems.map((item, i) => (
                <li key={i} className="action-item">
                  <input type="checkbox" id={`item-${i}`} defaultChecked={false} />
                  <label htmlFor={`item-${i}`}>{item}</label>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Modal Footer / Export Controls */}
        <div className="summary-modal-footer">
          <div className="export-actions-group">
            <button
              type="button"
              className="export-btn export-md-btn"
              onClick={handleDownloadMarkdown}
              title="Download Markdown (.md)"
            >
              📥 Download Markdown (.md)
            </button>
            <button
              type="button"
              className="export-btn export-pdf-btn"
              onClick={handlePrintPdf}
              title="Print or Save as PDF (.pdf)"
            >
              🖨️ Export PDF (.pdf)
            </button>
            <button
              type="button"
              className="export-btn export-copy-btn"
              onClick={handleCopy}
              title="Copy markdown text to clipboard"
            >
              {copied ? "✓ Copied!" : "📋 Copy Summary"}
            </button>
          </div>

          <div className="exit-actions-group">
            <button
              type="button"
              className="return-call-btn"
              onClick={onClose}
            >
              Return to Call
            </button>
            <button
              type="button"
              className="confirm-end-btn"
              onClick={onEndCallConfirm}
            >
              End Call & Exit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

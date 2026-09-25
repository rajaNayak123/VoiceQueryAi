import React, { useState, useMemo, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  NodeProps,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import type { Citation } from "../../types";
import {
  synthesizeKnowledgeGraph,
  ConversationPair,
  KnowledgeGraphNodeData,
} from "../../utils/knowledgeGraphBuilder";

// --- Custom Node Components ---

// 1. Root Hub Node Component
function HubNodeComponent({ data }: NodeProps<KnowledgeGraphNodeData>) {
  return (
    <div className="kg-node kg-node-hub">
      <div className="kg-node-hub-glow" />
      <div className="kg-node-header">
        <span className="kg-node-icon">📂</span>
        <span className="kg-badge kg-badge-hub">DOCUMENT HUB</span>
      </div>
      <div className="kg-node-title" title={data.documentTitle || data.label}>
        {data.documentTitle || data.label}
      </div>
      {data.subtitle && <div className="kg-node-subtitle">{data.subtitle}</div>}
      <Handle type="source" position={Position.Right} className="kg-handle kg-handle-source" />
    </div>
  );
}

// 2. Topic Node Component
function TopicNodeComponent({ data }: NodeProps<KnowledgeGraphNodeData>) {
  return (
    <div className="kg-node kg-node-topic">
      <Handle type="target" position={Position.Left} className="kg-handle kg-handle-target" />
      <div className="kg-node-header">
        <span className="kg-node-icon">💡</span>
        <span className="kg-badge kg-badge-topic">{data.category || "TOPIC"}</span>
        {data.turnsCount !== undefined && (
          <span className="kg-pill-turns">{data.turnsCount} turn{data.turnsCount > 1 ? "s" : ""}</span>
        )}
      </div>
      <div className="kg-node-title" title={data.title || data.label}>
        {data.title || data.label}
      </div>
      {data.snippet && (
        <div className="kg-node-snippet">
          "{data.snippet.slice(0, 75)}..."
        </div>
      )}
      <Handle type="source" position={Position.Right} className="kg-handle kg-handle-source" />
    </div>
  );
}

// 3. Document Section Node Component
function DocSectionNodeComponent({ data }: NodeProps<KnowledgeGraphNodeData>) {
  return (
    <div className="kg-node kg-node-doc">
      <Handle type="target" position={Position.Left} className="kg-handle kg-handle-target" />
      <div className="kg-node-header">
        <span className="kg-node-icon">📄</span>
        {data.page && <span className="kg-badge kg-badge-page">Page {data.page}</span>}
        <span className="kg-badge kg-badge-section">CITED EXCERPT</span>
      </div>
      <div className="kg-node-title" title={data.title || data.label}>
        {data.title || data.label}
      </div>
      {data.snippet && (
        <div className="kg-node-snippet kg-doc-snippet" title={data.snippet}>
          "{data.snippet.slice(0, 85)}..."
        </div>
      )}
      <Handle type="source" position={Position.Right} className="kg-handle kg-handle-source" />
    </div>
  );
}

// 4. Action Item & Decision Node Component
function ActionItemNodeComponent({ data }: NodeProps<KnowledgeGraphNodeData>) {
  const isDecision = data.nodeType === "decision";
  const isCompleted = data.status === "completed";

  return (
    <div
      className={`kg-node kg-node-action ${isDecision ? "is-decision" : ""} ${
        isCompleted ? "is-completed" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="kg-handle kg-handle-target" />
      <div className="kg-node-header">
        <span className="kg-node-icon">{isDecision ? "⚖️" : "⚡"}</span>
        <span className={`kg-badge ${isDecision ? "kg-badge-decision" : "kg-badge-action"}`}>
          {isDecision ? "KEY DECISION" : "ACTION ITEM"}
        </span>
        {data.priority && (
          <span className={`kg-priority-tag priority-${data.priority}`}>
            {data.priority.toUpperCase()}
          </span>
        )}
      </div>

      <div className="kg-action-content-row">
        <button
          type="button"
          className={`kg-checkbox-btn ${isCompleted ? "checked" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            data.onToggleStatus?.(data.id);
          }}
          title={isCompleted ? "Mark Pending" : "Mark Completed"}
        >
          {isCompleted ? "✓" : ""}
        </button>
        <div className={`kg-node-title kg-action-title ${isCompleted ? "strikethrough" : ""}`}>
          {data.label}
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  hub: HubNodeComponent,
  topic: TopicNodeComponent,
  doc_section: DocSectionNodeComponent,
  action_item: ActionItemNodeComponent,
  decision: ActionItemNodeComponent,
};

// --- Main Interactive Component ---

export interface PostCallKnowledgeGraphProps {
  conversationPairs: ConversationPair[];
  allCitations: Citation[];
  filename?: string;
  durationSeconds?: number;
}

export function PostCallKnowledgeGraph({
  conversationPairs,
  allCitations,
  filename = "Document",
}: PostCallKnowledgeGraphProps) {
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNodeData | null>(null);
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<"canvas" | "mermaid" | "outline">("canvas");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedMermaid, setCopiedMermaid] = useState(false);

  const toggleItemStatus = useCallback((nodeId: string) => {
    setCompletedItems((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  }, []);

  // Synthesize graph from conversation pairs and citations
  const rawGraph = useMemo(() => {
    return synthesizeKnowledgeGraph(conversationPairs, allCitations, filename);
  }, [conversationPairs, allCitations, filename]);

  // Apply interactive status toggles to nodes
  const nodes = useMemo(() => {
    return rawGraph.nodes.map((n) => {
      const isCompleted = !!completedItems[n.id];
      return {
        ...n,
        data: {
          ...n.data,
          status: isCompleted ? "completed" : ("pending" as const),
          onToggleStatus: toggleItemStatus,
        },
      };
    });
  }, [rawGraph.nodes, completedItems, toggleItemStatus]);

  const edges = rawGraph.edges;

  // Filtered nodes based on search query
  const displayNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodes;
    const q = searchQuery.toLowerCase();
    return nodes.map((n) => {
      const match =
        n.data.label?.toLowerCase().includes(q) ||
        n.data.title?.toLowerCase().includes(q) ||
        n.data.category?.toLowerCase().includes(q) ||
        n.data.snippet?.toLowerCase().includes(q);

      return {
        ...n,
        style: {
          opacity: match ? 1 : 0.25,
          transition: "opacity 0.2s ease",
        },
      };
    });
  }, [nodes, searchQuery]);

  const handleNodeClick = (_: React.MouseEvent, node: any) => {
    setSelectedNode(node.data);
  };

  const handlePaneClick = () => {
    setSelectedNode(null);
  };

  const handleCopyMermaid = async () => {
    await navigator.clipboard.writeText(rawGraph.mermaidCode);
    setCopiedMermaid(true);
    setTimeout(() => setCopiedMermaid(false), 2000);
  };

  return (
    <div className="kg-container">
      {/* Knowledge Graph Toolbar Header */}
      <div className="kg-toolbar">
        <div className="kg-toolbar-left">
          <div className="kg-stat-badge">
            <span className="stat-num">{rawGraph.stats.totalTopics}</span>
            <span className="stat-label">Topics</span>
          </div>
          <div className="kg-stat-badge">
            <span className="stat-num">{rawGraph.stats.totalSections}</span>
            <span className="stat-label">Doc Excerpts</span>
          </div>
          <div className="kg-stat-badge">
            <span className="stat-num">
              {rawGraph.stats.totalActionItems + rawGraph.stats.totalDecisions}
            </span>
            <span className="stat-label">Decisions & Actions</span>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="kg-search-wrap">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="kg-search-input"
            placeholder="Search topics, citations, action items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="kg-search-clear"
              onClick={() => setSearchQuery("")}
            >
              ✕
            </button>
          )}
        </div>

        {/* View Switcher & Export */}
        <div className="kg-toolbar-right">
          <div className="kg-view-toggle">
            <button
              type="button"
              className={`kg-toggle-btn ${viewMode === "canvas" ? "active" : ""}`}
              onClick={() => setViewMode("canvas")}
              title="Interactive Flow Canvas"
            >
              🧠 Mind Map
            </button>
            <button
              type="button"
              className={`kg-toggle-btn ${viewMode === "mermaid" ? "active" : ""}`}
              onClick={() => setViewMode("mermaid")}
              title="Mermaid Graph Code & Diagram"
            >
              📊 Mermaid
            </button>
            <button
              type="button"
              className={`kg-toggle-btn ${viewMode === "outline" ? "active" : ""}`}
              onClick={() => setViewMode("outline")}
              title="Tree Outline View"
            >
              📋 Outline
            </button>
          </div>

          <button
            type="button"
            className="kg-action-btn"
            onClick={handleCopyMermaid}
            title="Copy Mermaid syntax for GitHub Markdown / Docs"
          >
            {copiedMermaid ? "Copied Mermaid!" : "Copy Mermaid"}
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="kg-viewport">
        {viewMode === "canvas" && (
          <div className="kg-canvas-wrapper">
            <ReactFlowProvider>
              <ReactFlow
                nodes={displayNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={handleNodeClick}
                onPaneClick={handlePaneClick}
                fitView
                fitViewOptions={{ padding: 0.25 }}
                minZoom={0.3}
                maxZoom={1.5}
                attributionPosition="bottom-left"
              >
                <Background color="#1e293b" gap={18} size={1} />
                <Controls showInteractive={false} className="kg-controls" />
                <MiniMap
                  className="kg-minimap"
                  nodeColor={(n) => {
                    if (n.type === "hub") return "#6366f1";
                    if (n.type === "topic") return "#a855f7";
                    if (n.type === "doc_section") return "#06b6d4";
                    return "#10b981";
                  }}
                  maskColor="rgba(15, 20, 31, 0.75)"
                />
              </ReactFlow>
            </ReactFlowProvider>
          </div>
        )}

        {viewMode === "mermaid" && (
          <div className="kg-mermaid-container">
            <div className="kg-mermaid-header">
              <span className="kg-code-tag">MERMAID KNOWLEDGE GRAPH SYNTAX</span>
              <button
                type="button"
                className="kg-copy-btn"
                onClick={handleCopyMermaid}
              >
                {copiedMermaid ? "✓ Copied" : "Copy to Clipboard"}
              </button>
            </div>
            <pre className="kg-code-block">{rawGraph.mermaidCode}</pre>
            <div className="kg-mermaid-hint">
              💡 <em>Tip: Paste this into any GitHub Markdown file or Notion page to render this knowledge graph natively!</em>
            </div>
          </div>
        )}

        {viewMode === "outline" && (
          <div className="kg-outline-view">
            <h3 className="kg-outline-title">Session Knowledge Architecture Hierarchy</h3>
            <div className="kg-outline-tree">
              {nodes
                .filter((n) => n.type === "topic")
                .map((topicNode) => {
                  const linkedDocEdges = edges.filter((e) => e.source === topicNode.id);
                  const linkedDocIds = linkedDocEdges.map((e) => e.target);
                  const linkedDocs = nodes.filter((n) => linkedDocIds.includes(n.id));

                  return (
                    <div key={topicNode.id} className="outline-topic-card">
                      <div className="outline-topic-header">
                        <span className="outline-icon">💡</span>
                        <h4 className="outline-topic-name">{topicNode.data.title}</h4>
                        <span className="outline-badge">{topicNode.data.category}</span>
                      </div>

                      {/* Linked Sections */}
                      <div className="outline-subsections">
                        {linkedDocs.map((docNode) => {
                          const actionEdges = edges.filter((e) => e.source === docNode.id);
                          const actionNodeIds = actionEdges.map((e) => e.target);
                          const linkedActions = nodes.filter((n) => actionNodeIds.includes(n.id));

                          return (
                            <div key={docNode.id} className="outline-doc-card">
                              <div className="outline-doc-header">
                                <span className="outline-icon">📄</span>
                                <strong className="outline-doc-name">{docNode.data.title}</strong>
                                {docNode.data.page && (
                                  <span className="outline-page-pill">Page {docNode.data.page}</span>
                                )}
                              </div>
                              {docNode.data.snippet && (
                                <p className="outline-doc-snippet">"{docNode.data.snippet}"</p>
                              )}

                              {/* Linked Actions */}
                              {linkedActions.length > 0 && (
                                <div className="outline-actions-list">
                                  {linkedActions.map((actionNode) => {
                                    const isDone = completedItems[actionNode.id];
                                    const isDecision = actionNode.data.nodeType === "decision";
                                    return (
                                      <div
                                        key={actionNode.id}
                                        className={`outline-action-row ${isDone ? "is-done" : ""}`}
                                      >
                                        <button
                                          type="button"
                                          className={`outline-checkbox ${isDone ? "checked" : ""}`}
                                          onClick={() => toggleItemStatus(actionNode.id)}
                                        >
                                          {isDone ? "✓" : ""}
                                        </button>
                                        <span className="outline-action-text">
                                          {isDecision ? "⚖️ [Decision] " : "⚡ [Action] "}
                                          {actionNode.data.label}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Selected Node Inspector Drawer */}
        {selectedNode && viewMode === "canvas" && (
          <aside className="kg-inspector-drawer">
            <div className="inspector-header">
              <div className="inspector-tag-row">
                <span className={`kg-badge kg-badge-${selectedNode.nodeType}`}>
                  {selectedNode.nodeType.replace("_", " ").toUpperCase()}
                </span>
                {selectedNode.category && (
                  <span className="inspector-category">{selectedNode.category}</span>
                )}
              </div>
              <button
                type="button"
                className="inspector-close-btn"
                onClick={() => setSelectedNode(null)}
              >
                ✕
              </button>
            </div>

            <h4 className="inspector-title">{selectedNode.title || selectedNode.label}</h4>

            {selectedNode.page && (
              <div className="inspector-meta-row">
                <span className="meta-key">Document Page:</span>
                <span className="meta-val highlight-cyan">Page {selectedNode.page}</span>
              </div>
            )}

            {selectedNode.documentTitle && (
              <div className="inspector-meta-row">
                <span className="meta-key">Source Document:</span>
                <span className="meta-val">{selectedNode.documentTitle}</span>
              </div>
            )}

            {selectedNode.snippet && (
              <div className="inspector-snippet-box">
                <div className="snippet-box-label">Grounded Context Excerpt:</div>
                <p className="snippet-box-text">"{selectedNode.snippet}"</p>
              </div>
            )}

            {selectedNode.turnsCount !== undefined && (
              <div className="inspector-meta-row">
                <span className="meta-key">Discussion Turns:</span>
                <span className="meta-val">{selectedNode.turnsCount} questions & answers</span>
              </div>
            )}

            {/* Action Item Controls in Inspector */}
            {(selectedNode.nodeType === "action_item" || selectedNode.nodeType === "decision") && (
              <div className="inspector-action-controls">
                <button
                  type="button"
                  className={`inspector-status-toggle ${
                    completedItems[selectedNode.id] ? "completed" : ""
                  }`}
                  onClick={() => toggleItemStatus(selectedNode.id)}
                >
                  {completedItems[selectedNode.id]
                    ? "✓ Mark as Incomplete"
                    : "Mark as Completed / Approved"}
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

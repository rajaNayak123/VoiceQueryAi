import type { Node, Edge } from "reactflow";
import { MarkerType } from "reactflow";
import type { Citation } from "../types";

export interface ConversationPair {
  question: string;
  answer: string;
  time?: string;
}

export type GraphNodeType = "hub" | "topic" | "doc_section" | "action_item" | "decision";

export interface KnowledgeGraphNodeData {
  id: string;
  nodeType: GraphNodeType;
  label: string;
  title?: string;
  subtitle?: string;
  snippet?: string;
  page?: number;
  documentTitle?: string;
  status?: "pending" | "in_progress" | "completed";
  category?: string;
  turnsCount?: number;
  priority?: "high" | "medium" | "low";
  timestamp?: string;
  citationId?: string;
  citations?: Citation[];
  onToggleStatus?: (nodeId: string) => void;
}

export interface SynthesizedGraph {
  nodes: Node<KnowledgeGraphNodeData>[];
  edges: Edge[];
  mermaidCode: string;
  stats: {
    totalTopics: number;
    totalSections: number;
    totalActionItems: number;
    totalDecisions: number;
  };
}

// Clean text for Mermaid label syntax
function cleanForMermaid(str: string): string {
  return str.replace(/["\n\r\[\]\(\)\{\};]/g, " ").trim().slice(0, 50);
}

// Derive main topics from conversation pairs and citations
interface TopicGroup {
  id: string;
  title: string;
  category: string;
  questions: ConversationPair[];
  citations: Citation[];
  actionItems: {
    id: string;
    text: string;
    type: "action_item" | "decision";
    priority: "high" | "medium" | "low";
  }[];
}

export function synthesizeKnowledgeGraph(
  conversationPairs: ConversationPair[],
  citations: Citation[],
  documentTitle: string = "Document"
): SynthesizedGraph {
  const topicGroups: TopicGroup[] = [];

  // Fallback defaults if conversation is short or empty
  if (conversationPairs.length === 0) {
    const defaultGroup: TopicGroup = {
      id: "topic-overview",
      title: "Document Core Architecture & Key Provisions",
      category: "Architecture",
      questions: [
        {
          question: `Overview of ${documentTitle}`,
          answer: "Comprehensive review of system specifications, procedures, and architectural constraints.",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ],
      citations: citations.length > 0 ? citations.slice(0, 2) : [],
      actionItems: [
        {
          id: "act-1",
          text: `Review highlighted sections in ${documentTitle}`,
          type: "action_item",
          priority: "high",
        },
        {
          id: "dec-1",
          text: "Retain session audit record for compliance verification",
          type: "decision",
          priority: "medium",
        },
      ],
    };
    topicGroups.push(defaultGroup);
  } else {
    // Cluster conversation pairs into semantic topic groups
    conversationPairs.forEach((pair, index) => {
      const qLower = pair.question.toLowerCase();
      let category = "General";
      let topicTitle = pair.question.replace(/\?$/, "").trim();

      // Categorize and title refine
      if (qLower.includes("cache") || qLower.includes("redis") || qLower.includes("storage") || qLower.includes("memory")) {
        category = "Caching & Storage";
        topicTitle = "Caching Architecture & Data Persistence";
      } else if (qLower.includes("slot") || qLower.includes("appointment") || qLower.includes("book") || qLower.includes("schedule")) {
        category = "Workflow & Scheduling";
        topicTitle = "Appointment & Slot Hold Workflows";
      } else if (qLower.includes("latency") || qLower.includes("speed") || qLower.includes("timeout") || qLower.includes("e2e")) {
        category = "Performance & Latency";
        topicTitle = "End-to-End Latency & Performance SLAs";
      } else if (qLower.includes("auth") || qLower.includes("clerk") || qLower.includes("token") || qLower.includes("security")) {
        category = "Security & Auth";
        topicTitle = "Authentication & Authorization Security";
      } else if (qLower.includes("compare") || qLower.includes("difference") || qLower.includes("versus") || qLower.includes("vs")) {
        category = "Comparative Analysis";
        topicTitle = "Comparative Synthesis & Document Delta";
      } else if (qLower.includes("error") || qLower.includes("fail") || qLower.includes("exception") || qLower.includes("fallback")) {
        category = "Reliability";
        topicTitle = "Error Handling & Fallback Strategy";
      } else {
        // Truncate long question to concise topic title
        if (topicTitle.length > 45) {
          topicTitle = topicTitle.slice(0, 42) + "...";
        }
      }

      // Find if topic group already exists
      let existing = topicGroups.find((g) => g.title === topicTitle || (g.category === category && category !== "General"));
      if (!existing) {
        existing = {
          id: `topic-${topicGroups.length + 1}`,
          title: topicTitle,
          category,
          questions: [],
          citations: [],
          actionItems: [],
        };
        topicGroups.push(existing);
      }
      existing.questions.push(pair);

      // Associate citation if available
      const pairedCitation = citations[index % citations.length];
      if (pairedCitation && !existing.citations.some((c) => c.id === pairedCitation.id)) {
        existing.citations.push(pairedCitation);
      }

      // Generate context-aware action items / decisions
      if (category === "Caching & Storage") {
        if (!existing.actionItems.some((a) => a.text.includes("TTL"))) {
          existing.actionItems.push({
            id: `act-${existing.id}-1`,
            text: "Verify Redis key TTL and eviction policy configurations",
            type: "action_item",
            priority: "high",
          });
          existing.actionItems.push({
            id: `dec-${existing.id}-2`,
            text: "Adopt semantic caching threshold of 0.85 for sub-second responses",
            type: "decision",
            priority: "medium",
          });
        }
      } else if (category === "Workflow & Scheduling") {
        if (!existing.actionItems.some((a) => a.text.includes("timeout"))) {
          existing.actionItems.push({
            id: `act-${existing.id}-1`,
            text: "Confirm 5-minute temporary slot hold timeout with backend team",
            type: "action_item",
            priority: "high",
          });
          existing.actionItems.push({
            id: `dec-${existing.id}-2`,
            text: "Enforce atomic slot lock in PostgreSQL transactions",
            type: "decision",
            priority: "high",
          });
        }
      } else if (category === "Performance & Latency") {
        if (!existing.actionItems.some((a) => a.text.includes("latency"))) {
          existing.actionItems.push({
            id: `act-${existing.id}-1`,
            text: "Benchmark STT + LLM TTFT pipeline to sustain < 500ms target",
            type: "action_item",
            priority: "high",
          });
        }
      } else {
        existing.actionItems.push({
          id: `act-${existing.id}-${existing.actionItems.length + 1}`,
          text: `Verify implementation details against Section ${existing.citations[0]?.section || "Doc specs"}`,
          type: "action_item",
          priority: "medium",
        });
      }
    });
  }

  // Ensure any unmatched citations are assigned to the first topic or an extra topic
  if (citations.length > 0 && topicGroups[0].citations.length === 0) {
    topicGroups[0].citations.push(...citations.slice(0, 3));
  }

  // Limit to maximum 4 topics for clean visual layout
  const activeTopics = topicGroups.slice(0, 4);

  const nodes: Node<KnowledgeGraphNodeData>[] = [];
  const edges: Edge[] = [];

  // 1. Root Hub Node (Column 0: x = 40)
  const hubId = "hub-document";
  nodes.push({
    id: hubId,
    type: "hub",
    position: { x: 40, y: Math.max(120, (activeTopics.length * 180) / 2 - 30) },
    data: {
      id: hubId,
      nodeType: "hub",
      label: documentTitle,
      title: "Document Focus Hub",
      subtitle: `${conversationPairs.length} Q&A Turns · ${citations.length} Citations`,
      category: "Root",
      documentTitle,
      turnsCount: conversationPairs.length,
    },
  });

  let currentTopicY = 40;
  let currentDocY = 40;
  let currentActionY = 40;

  let totalSections = 0;
  let totalActionItems = 0;
  let totalDecisions = 0;

  activeTopics.forEach((topic) => {
    // 2. Topic Node (Column 1: x = 360)
    const topicNodeId = topic.id;
    const topicY = currentTopicY;
    currentTopicY += 210;

    nodes.push({
      id: topicNodeId,
      type: "topic",
      position: { x: 360, y: topicY },
      data: {
        id: topicNodeId,
        nodeType: "topic",
        label: topic.title,
        title: topic.title,
        subtitle: `${topic.questions.length} Turn${topic.questions.length > 1 ? "s" : ""} · ${topic.category}`,
        category: topic.category,
        turnsCount: topic.questions.length,
        snippet: topic.questions[0]?.answer || "Voice discussion topic",
        documentTitle,
      },
    });

    // Edge: Hub ➡️ Topic
    edges.push({
      id: `edge-${hubId}-${topicNodeId}`,
      source: hubId,
      target: topicNodeId,
      type: "smoothstep",
      animated: true,
      label: "explores",
      style: { stroke: "#6366f1", strokeWidth: 2.2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1" },
    });

    // 3. Document Section Nodes (Column 2: x = 740)
    const topicCitations =
      topic.citations.length > 0
        ? topic.citations
        : citations.slice(0, 1);

    const docNodeIds: string[] = [];

    if (topicCitations.length === 0) {
      // Synthetic doc section fallback
      const docSectionId = `doc-${topicNodeId}-p1`;
      docNodeIds.push(docSectionId);
      totalSections++;

      nodes.push({
        id: docSectionId,
        type: "doc_section",
        position: { x: 740, y: currentDocY },
        data: {
          id: docSectionId,
          nodeType: "doc_section",
          label: `Page 1: General Specifications`,
          title: `General Specifications`,
          page: 1,
          documentTitle,
          snippet: `Context referenced from ${documentTitle} for "${topic.title}".`,
          category: "Section",
        },
      });
      currentDocY += 160;

      edges.push({
        id: `edge-${topicNodeId}-${docSectionId}`,
        source: topicNodeId,
        target: docSectionId,
        type: "smoothstep",
        animated: true,
        label: "cites",
        style: { stroke: "#06b6d4", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4" },
      });
    } else {
      topicCitations.slice(0, 2).forEach((cite, cIdx) => {
        const docSectionId = `doc-${topicNodeId}-${cIdx}`;
        docNodeIds.push(docSectionId);
        totalSections++;

        const sectionName = cite.section || `Page ${cite.page} Context`;
        nodes.push({
          id: docSectionId,
          type: "doc_section",
          position: { x: 740, y: currentDocY },
          data: {
            id: docSectionId,
            nodeType: "doc_section",
            label: `Page ${cite.page}: ${sectionName}`,
            title: sectionName,
            page: cite.page,
            documentTitle: cite.documentTitle || documentTitle,
            snippet: cite.snippet,
            citationId: cite.id,
            category: "Citation Excerpt",
          },
        });
        currentDocY += 160;

        // Edge: Topic ➡️ Doc Section
        edges.push({
          id: `edge-${topicNodeId}-${docSectionId}`,
          source: topicNodeId,
          target: docSectionId,
          type: "smoothstep",
          animated: true,
          label: "grounds in",
          style: { stroke: "#06b6d4", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4" },
        });
      });
    }

    // 4. Action Items & Decisions Nodes (Column 3: x = 1140)
    topic.actionItems.slice(0, 2).forEach((action, aIdx) => {
      const actionNodeId = `act-${topicNodeId}-${aIdx}`;
      if (action.type === "decision") totalDecisions++;
      else totalActionItems++;

      nodes.push({
        id: actionNodeId,
        type: "action_item",
        position: { x: 1140, y: currentActionY },
        data: {
          id: actionNodeId,
          nodeType: action.type,
          label: action.text,
          title: action.type === "decision" ? "Key Decision" : "Action Item",
          subtitle: `${action.priority.toUpperCase()} PRIORITY`,
          priority: action.priority,
          status: "pending",
          category: action.type === "decision" ? "Decision" : "Action",
        },
      });
      currentActionY += 140;

      // Connect from Doc Section (or Topic directly if doc exists)
      const sourceNodeId = docNodeIds[0] || topicNodeId;
      const isDecision = action.type === "decision";

      edges.push({
        id: `edge-${sourceNodeId}-${actionNodeId}`,
        source: sourceNodeId,
        target: actionNodeId,
        type: "smoothstep",
        animated: false,
        label: isDecision ? "decides" : "action required",
        style: {
          stroke: isDecision ? "#f59e0b" : "#10b981",
          strokeWidth: 2,
          strokeDasharray: isDecision ? "4 2" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isDecision ? "#f59e0b" : "#10b981",
        },
      });
    });
  });

  // Generate Mermaid diagram representation
  const mermaidLines: string[] = ["graph LR"];
  mermaidLines.push(`    classDef hubStyle fill:#1e1b4b,stroke:#818cf8,stroke-width:2px,color:#fff;`);
  mermaidLines.push(`    classDef topicStyle fill:#1e293b,stroke:#a855f7,stroke-width:2px,color:#f8fafc;`);
  mermaidLines.push(`    classDef docStyle fill:#0f2937,stroke:#06b6d4,stroke-width:2px,color:#e0f2fe;`);
  mermaidLines.push(`    classDef actionStyle fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;`);
  mermaidLines.push(`    classDef decisionStyle fill:#451a03,stroke:#f59e0b,stroke-width:2px,color:#fffbeb;`);

  nodes.forEach((node) => {
    const cleanLabel = cleanForMermaid(node.data.title || node.data.label);
    if (node.type === "hub") {
      mermaidLines.push(`    ${node.id}["📂 ${cleanLabel}"]:::hubStyle`);
    } else if (node.type === "topic") {
      mermaidLines.push(`    ${node.id}["💡 ${cleanLabel}"]:::topicStyle`);
    } else if (node.type === "doc_section") {
      const pageInfo = node.data.page ? `(P.${node.data.page}) ` : "";
      mermaidLines.push(`    ${node.id}["📄 ${pageInfo}${cleanLabel}"]:::docStyle`);
    } else if (node.type === "action_item") {
      const isDecision = node.data.nodeType === "decision";
      const icon = isDecision ? "⚖️" : "✅";
      const styleClass = isDecision ? "decisionStyle" : "actionStyle";
      mermaidLines.push(`    ${node.id}["${icon} ${cleanLabel}"]:::${styleClass}`);
    }
  });

  edges.forEach((edge) => {
    const label = edge.label ? `|"${edge.label}"|` : "";
    mermaidLines.push(`    ${edge.source} -->${label} ${edge.target}`);
  });

  const mermaidCode = mermaidLines.join("\n");

  return {
    nodes,
    edges,
    mermaidCode,
    stats: {
      totalTopics: activeTopics.length,
      totalSections,
      totalActionItems,
      totalDecisions,
    },
  };
}

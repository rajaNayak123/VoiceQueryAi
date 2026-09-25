import { Request, Response, NextFunction } from "express";
import { AppError } from "../../../middleware/errorHandler";
import { sessionsService } from "../service/sessions.service";

interface TopicItem {
  id: string;
  title: string;
  category: string;
  turnsCount: number;
}

interface DocSectionItem {
  id: string;
  topicId: string;
  page: number;
  section: string;
  snippet: string;
}

interface ActionDecisionItem {
  id: string;
  docSectionId: string;
  type: "action_item" | "decision";
  text: string;
  priority: "high" | "medium" | "low";
}

export const sessionsController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { documentId, documentIds } = req.body as {
        documentId?: string;
        documentIds?: string[];
      };
      const ids =
        documentIds && Array.isArray(documentIds) && documentIds.length > 0
          ? documentIds
          : documentId
          ? [documentId]
          : [];

      if (ids.length === 0) {
        throw new AppError(400, "documentId or documentIds array is required");
      }

      const userId = (req as any).auth?.userId;
      const result = await sessionsService.createSession(
        { documentIds: ids, userId },
        userId
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  async generateKnowledgeGraph(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        documentTitle = "Document",
        conversationPairs = [],
        citations = [],
      } = req.body as {
        documentTitle?: string;
        conversationPairs?: { question: string; answer: string }[];
        citations?: { id: string; page: number; section?: string; snippet: string }[];
      };

      const topics: TopicItem[] = [];
      const sections: DocSectionItem[] = [];
      const actionItems: ActionDecisionItem[] = [];

      if (conversationPairs.length === 0) {
        topics.push({
          id: "topic-1",
          title: "Document Core Architecture & Key Provisions",
          category: "Architecture",
          turnsCount: 1,
        });
        sections.push({
          id: "sec-1",
          topicId: "topic-1",
          page: citations[0]?.page || 1,
          section: citations[0]?.section || "Core Specifications",
          snippet: citations[0]?.snippet || `Overview and foundational architecture for ${documentTitle}`,
        });
        actionItems.push({
          id: "act-1",
          docSectionId: "sec-1",
          type: "action_item",
          text: `Review cited specifications in ${documentTitle}`,
          priority: "high",
        });
        actionItems.push({
          id: "dec-1",
          docSectionId: "sec-1",
          type: "decision",
          text: "Retain post-call knowledge graph for team audit",
          priority: "medium",
        });
      } else {
        conversationPairs.slice(0, 4).forEach((pair, idx) => {
          const q = pair.question.toLowerCase();
          let category = "General";
          let title = pair.question.replace(/\?$/, "").trim();

          if (q.includes("cache") || q.includes("redis")) {
            category = "Caching & Storage";
            title = "Caching Architecture & Data Persistence";
          } else if (q.includes("slot") || q.includes("appointment")) {
            category = "Workflow & Scheduling";
            title = "Appointment & Slot Hold Workflows";
          } else if (q.includes("latency") || q.includes("speed")) {
            category = "Performance";
            title = "End-to-End Latency & Performance SLAs";
          } else if (q.includes("auth") || q.includes("security")) {
            category = "Security & Auth";
            title = "Authentication & Authorization Security";
          }

          const topicId = `topic-${idx + 1}`;
          topics.push({
            id: topicId,
            title,
            category,
            turnsCount: 1,
          });

          const cite = citations[idx % (citations.length || 1)] || {
            page: 1,
            section: "General Spec",
            snippet: pair.answer,
          };

          const secId = `sec-${topicId}`;
          sections.push({
            id: secId,
            topicId,
            page: cite.page || 1,
            section: cite.section || "Relevant Section",
            snippet: cite.snippet || pair.answer,
          });

          actionItems.push({
            id: `act-${topicId}`,
            docSectionId: secId,
            type: "action_item",
            text: `Follow up on recommendations for "${title}"`,
            priority: "high",
          });
        });
      }

      res.status(200).json({
        documentTitle,
        topics,
        sections,
        actionItems,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
};

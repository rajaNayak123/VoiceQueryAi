import { describe, it, expect, vi } from "vitest";
import { sessionsController } from "../src/modules/sessions/controller/sessions.controller";
import type { Request, Response } from "express";

describe("sessionsController.generateKnowledgeGraph", () => {
  it("returns fallback knowledge graph when no conversation pairs are provided", async () => {
    const req = {
      body: {
        documentTitle: "ArchitectureOverview.pdf",
        conversationPairs: [],
        citations: [],
      },
    } as unknown as Request;

    let responseData: any = null;
    let statusCode: number = 0;

    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        responseData = data;
        return this;
      },
    } as unknown as Response;

    const next = vi.fn();

    await sessionsController.generateKnowledgeGraph(req, res, next);

    expect(statusCode).toBe(200);
    expect(responseData).toBeDefined();
    expect(responseData.documentTitle).toBe("ArchitectureOverview.pdf");
    expect(responseData.topics.length).toBeGreaterThan(0);
    expect(responseData.sections.length).toBeGreaterThan(0);
    expect(responseData.actionItems.length).toBeGreaterThan(0);
  });

  it("extracts categorized topics, sections and action items from Q&A pairs", async () => {
    const req = {
      body: {
        documentTitle: "BackendArchitecture.pdf",
        conversationPairs: [
          {
            question: "How does Redis caching work?",
            answer: "Redis caches vector query results with a 1-hour TTL.",
          },
          {
            question: "What is the appointment hold timeout?",
            answer: "The temporary slot hold timeout is 5 minutes.",
          },
        ],
        citations: [
          {
            id: "cite-1",
            page: 2,
            section: "Cache Architecture",
            snippet: "Redis key eviction policy...",
          },
        ],
      },
    } as unknown as Request;

    let responseData: any = null;
    let statusCode: number = 0;

    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        responseData = data;
        return this;
      },
    } as unknown as Response;

    const next = vi.fn();

    await sessionsController.generateKnowledgeGraph(req, res, next);

    expect(statusCode).toBe(200);
    expect(responseData.topics.length).toBe(2);
    expect(responseData.topics[0].category).toBe("Caching & Storage");
    expect(responseData.topics[1].category).toBe("Workflow & Scheduling");
    expect(responseData.actionItems.length).toBe(2);
  });
});

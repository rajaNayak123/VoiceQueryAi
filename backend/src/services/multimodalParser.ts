import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { ChunkWithMetadata } from "../types";
import { logger } from "../utils/logger";

const execFileAsync = promisify(execFile);

function resolvePythonBinary(): string {
  const possiblePaths = [
    path.resolve(__dirname, "../../../agent/.venv/bin/python3"),
    path.resolve(process.cwd(), "../agent/.venv/bin/python3"),
    path.resolve(process.cwd(), "agent/.venv/bin/python3"),
    process.env.PYTHON_PATH || "python3",
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return "python3";
}

function resolveAgentCwd(): string {
  const possibleCwds = [
    path.resolve(__dirname, "../../../agent"),
    path.resolve(process.cwd(), "../agent"),
    path.resolve(process.cwd(), "agent"),
  ];

  for (const cwd of possibleCwds) {
    if (fs.existsSync(cwd)) {
      return cwd;
    }
  }

  return process.cwd();
}

export interface MultimodalParseResult {
  chunks: ChunkWithMetadata[];
  pageCount: number;
}

/**
 * Executes the Python multi-modal parser (Docling-core + PyMuPDF) to extract
 * tables into Markdown, preserve section hierarchies with breadcrumbs, and identify diagrams/figures.
 */
export async function parsePdfMultimodal(
  filePath: string
): Promise<MultimodalParseResult | null> {
  const pythonBin = resolvePythonBinary();
  const agentCwd = resolveAgentCwd();
  const absolutePdfPath = path.resolve(filePath);

  logger.info(
    { pythonBin, agentCwd, filePath: absolutePdfPath },
    "Attempting multi-modal PDF parsing"
  );

  try {
    const { stdout, stderr } = await execFileAsync(
      pythonBin,
      ["-m", "app.rag.multimodal_parser", absolutePdfPath],
      {
        cwd: agentCwd,
        maxBuffer: 50 * 1024 * 1024, // 50MB
        timeout: 60000,              // 60s
      }
    );

    if (stderr && stderr.trim().length > 0) {
      logger.debug({ stderr }, "Multi-modal parser stderr output");
    }

    // Extract JSON between markers
    let jsonStr = "";
    const startMarker = "__JSON_START__";
    const endMarker = "__JSON_END__";

    const startIdx = stdout.indexOf(startMarker);
    const endIdx = stdout.indexOf(endMarker);

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      jsonStr = stdout.substring(startIdx + startMarker.length, endIdx).trim();
    } else {
      // Fallback: search for first { and last }
      const firstBrace = stdout.indexOf("{");
      const lastBrace = stdout.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = stdout.substring(firstBrace, lastBrace + 1).trim();
      }
    }

    if (!jsonStr) {
      logger.warn({ stdout }, "Multi-modal parser produced no JSON payload");
      return null;
    }

    const parsed = JSON.parse(jsonStr) as {
      success: boolean;
      count?: number;
      chunks?: ChunkWithMetadata[];
      error?: string;
    };

    if (!parsed.success || !Array.isArray(parsed.chunks) || parsed.chunks.length === 0) {
      logger.warn({ error: parsed.error }, "Multi-modal parser returned unsuccesful or empty chunks");
      return null;
    }

    // Determine max page number
    let maxPage = 1;
    for (const c of parsed.chunks) {
      if (typeof c.page === "number" && c.page > maxPage) {
        maxPage = c.page;
      }
    }

    logger.info(
      { chunkCount: parsed.chunks.length, maxPage },
      "Multi-modal PDF parsing succeeded"
    );

    return {
      chunks: parsed.chunks,
      pageCount: maxPage,
    };
  } catch (err) {
    logger.warn({ err }, "Multi-modal PDF parsing failed, falling back to standard loader");
    return null;
  }
}

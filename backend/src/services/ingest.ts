import { prisma } from "../config/db";
import { logger } from "../utils/logger";
import { loadPdfPages } from "./pdfLoader";
import { splitIntoChunks } from "./textSplitter";
import { extractPdfCoordinates } from "./pdfCoordinates";
import { embedTexts } from "./embeddings";
import { parsePdfMultimodal } from "./multimodalParser";
import type { ChunkWithMetadata } from "../types";
import {
  collectionNameFor,
  createCollection,
  upsertChunks,
} from "./vectorStore";

export async function ingestDocument(params: {
  documentId: string;
  filePath: string;
}): Promise<void> {
  const { documentId, filePath } = params;

  try {
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "processing" },
    });

    // 1. Attempt multi-modal parsing (Markdown tables, hierarchies, diagrams with coordinates)
    let chunks: ChunkWithMetadata[] = [];
    let pageCount = 0;

    const multimodalResult = await parsePdfMultimodal(filePath);
    if (multimodalResult && multimodalResult.chunks.length > 0) {
      chunks = multimodalResult.chunks;
      pageCount = multimodalResult.pageCount;
      logger.info(
        { documentId, chunkCount: chunks.length, pageCount },
        "Extracted multi-modal artifacts (tables, hierarchy, diagrams)"
      );
    } else {
      logger.info(
        { documentId },
        "Falling back to standard PDF loader and text splitter"
      );
      const [pages, coordinateMap] = await Promise.all([
        loadPdfPages(filePath),
        extractPdfCoordinates(filePath),
      ]);
      chunks = await splitIntoChunks(pages, coordinateMap);
      pageCount = pages.length;
    }

    if (chunks.length === 0) {
      throw new Error("PDF produced no extractable text (scanned/empty PDF?)");
    }

    // 2. Embed each chunk via HuggingFace Inference Providers API.
    const vectors = await embedTexts(chunks.map((c) => c.text));

    // 3. Create a fresh Qdrant collection for this document.
    const collectionName = collectionNameFor(documentId);
    await createCollection(collectionName);

    // 4. Upsert all chunk vectors with rich multi-modal payload.
    await upsertChunks({ collectionName, documentId, chunks, vectors });

    // 5. Flip status to ready.
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "ready",
        qdrantCollection: collectionName,
        pageCount,
      },
    });

    logger.info({ documentId, collectionName }, "Ingestion complete");
  } catch (err) {
    logger.error({ err, documentId }, "Ingestion failed");
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "failed",
        failureReason: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

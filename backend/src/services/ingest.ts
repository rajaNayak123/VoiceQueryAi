import { prisma } from "../config/db";
import { logger } from "../utils/logger";
import { loadPdfPages } from "./pdfLoader";
import { splitIntoChunks } from "./textSplitter";
import { extractPdfCoordinates } from "./pdfCoordinates";
import { embedTexts } from "./embeddings";
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

    // 1. Load PDF into per-page LangChain Documents and extract layout coordinates.
    const [pages, coordinateMap] = await Promise.all([
      loadPdfPages(filePath),
      extractPdfCoordinates(filePath),
    ]);

    // 2. Split into chunks, preserving page number and bounding box coordinates in metadata.
    const chunks = await splitIntoChunks(pages, coordinateMap);

    if (chunks.length === 0) {
      throw new Error("PDF produced no extractable text (scanned/empty PDF?)");
    }

    // 3. Embed each chunk via HuggingFace Inference Providers API.
    const vectors = await embedTexts(chunks.map((c) => c.text));

    // 4. Create a fresh Qdrant collection for this document.
    const collectionName = collectionNameFor(documentId);
    await createCollection(collectionName);

    // 5. Upsert all chunk vectors with payload { text, page, documentId }.
    await upsertChunks({ collectionName, documentId, chunks, vectors });

    // 6. Flip status to ready.
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "ready",
        qdrantCollection: collectionName,
        pageCount: pages.length,
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

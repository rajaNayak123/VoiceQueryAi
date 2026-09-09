import { v4 as uuidv4 } from "uuid";
import { qdrant, EMBEDDING_DIM } from "../config/qdrant";
import type { ChunkWithMetadata } from "../types";
import { logger } from "../utils/logger";

export function collectionNameFor(documentId: string): string {
  return `doc_${documentId}`;
}

export async function createCollection(collectionName: string): Promise<void> {
  await qdrant.createCollection(collectionName, {
    vectors: { size: EMBEDDING_DIM, distance: "Cosine" },
  });

  // Create full-text payload index on 'text' for BM25 and keyword search
  try {
    await qdrant.createPayloadIndex(collectionName, {
      field_name: "text",
      field_schema: "text",
    });
  } catch (err) {
    logger.warn({ err, collectionName }, "Could not create text payload index");
  }

  logger.info({ collectionName }, "Created Qdrant collection with text index");
}

export async function upsertChunks(params: {
  collectionName: string;
  documentId: string;
  chunks: ChunkWithMetadata[];
  vectors: number[][];
}): Promise<void> {
  const { collectionName, documentId, chunks, vectors } = params;

  const points = chunks.map((chunk, i) => ({
    id: uuidv4(),
    vector: vectors[i],
    payload: {
      text: chunk.text,
      page: chunk.page,
      bbox: chunk.bbox ?? null,
      boxes: chunk.boxes ?? null,
      documentId,
    },
  }));

  // Batch upserts to avoid oversized requests on large PDFs.
  const BATCH_SIZE = 64;
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await qdrant.upsert(collectionName, { wait: true, points: batch });
  }

  logger.info(
    { collectionName, count: points.length },
    "Upserted chunks into Qdrant"
  );
}

export async function deleteCollection(collectionName: string): Promise<void> {
  await qdrant.deleteCollection(collectionName);
}

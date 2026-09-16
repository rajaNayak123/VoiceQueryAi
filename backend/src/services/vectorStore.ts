import { v4 as uuidv4 } from "uuid";
import { qdrant, EMBEDDING_DIM } from "../config/qdrant";
import type { ChunkWithMetadata } from "../types";
import { logger } from "../utils/logger";

export const MULTI_TENANT_COLLECTION = "pdf_documents";

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

  // Create keyword index on 'documentId' for Qdrant multi-tenancy filtered vector search
  try {
    await qdrant.createPayloadIndex(collectionName, {
      field_name: "documentId",
      field_schema: "keyword",
    });
  } catch (err) {
    logger.warn({ err, collectionName }, "Could not create documentId payload index");
  }

  // Create keyword index on 'filename' for document-specific filtering
  try {
    await qdrant.createPayloadIndex(collectionName, {
      field_name: "filename",
      field_schema: "keyword",
    });
  } catch (err) {
    logger.warn({ err, collectionName }, "Could not create filename payload index");
  }

  logger.info({ collectionName }, "Created Qdrant collection with multi-tenancy indices");
}

export async function ensureMultiTenantCollection(): Promise<string> {
  try {
    const res = await qdrant.collectionExists(MULTI_TENANT_COLLECTION);
    if (!res?.exists) {
      await createCollection(MULTI_TENANT_COLLECTION);
    }
  } catch {
    try {
      await createCollection(MULTI_TENANT_COLLECTION);
    } catch {
      // Collection already exists or created concurrently
    }
  }
  return MULTI_TENANT_COLLECTION;
}

export async function upsertChunks(params: {
  collectionName: string;
  documentId: string;
  filename?: string;
  chunks: ChunkWithMetadata[];
  vectors: number[][];
}): Promise<void> {
  const { collectionName, documentId, filename, chunks, vectors } = params;

  const points = chunks.map((chunk, i) => ({
    id: uuidv4(),
    vector: vectors[i],
    payload: {
      text: chunk.text,
      page: chunk.page,
      bbox: chunk.bbox ?? null,
      boxes: chunk.boxes ?? null,
      contentType: chunk.contentType ?? "text",
      section: chunk.section ?? null,
      caption: chunk.caption ?? null,
      documentId,
      filename: filename ?? null,
    },
  }));

  // Batch upserts to avoid oversized requests on large PDFs.
  const BATCH_SIZE = 64;
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await qdrant.upsert(collectionName, { wait: true, points: batch });
  }

  logger.info(
    { collectionName, count: points.length, documentId },
    "Upserted chunks into primary Qdrant collection"
  );

  // Also ensure chunks exist in the shared multi-tenant collection if different
  if (collectionName !== MULTI_TENANT_COLLECTION) {
    try {
      await ensureMultiTenantCollection();
      for (let i = 0; i < points.length; i += BATCH_SIZE) {
        const batch = points.slice(i, i + BATCH_SIZE);
        await qdrant.upsert(MULTI_TENANT_COLLECTION, { wait: true, points: batch });
      }
      logger.info(
        { count: points.length, documentId },
        "Upserted chunks into multi-tenant Qdrant collection"
      );
    } catch (err) {
      logger.warn({ err, documentId }, "Failed to mirror chunks to multi-tenant collection");
    }
  }
}

export async function deleteCollection(collectionName: string): Promise<void> {
  await qdrant.deleteCollection(collectionName);
}

export async function deleteDocumentPoints(documentId: string): Promise<void> {
  try {
    await qdrant.delete(MULTI_TENANT_COLLECTION, {
      wait: true,
      filter: {
        must: [
          {
            key: "documentId",
            match: { value: documentId },
          },
        ],
      },
    });
    logger.info({ documentId }, "Deleted document points from multi-tenant collection");
  } catch (err) {
    logger.warn({ err, documentId }, "Failed to delete points from multi-tenant collection (continuing)");
  }
}

import { Queue, Worker, Job } from "bullmq";
import { redisConnection } from "../../config/redis";
import { ingestDocument } from "../ingest";
import { broadcastDocumentStatus } from "../websocket/documentSocket";
import { prisma } from "../../config/db";
import { logger } from "../../utils/logger";

export interface IngestionJobData {
  documentId: string;
  filePath: string;
}

export const DOCUMENT_INGESTION_QUEUE_NAME = "document-ingestion";

export const documentIngestionQueue = new Queue<IngestionJobData>(
  DOCUMENT_INGESTION_QUEUE_NAME,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        count: 100,
      },
      removeOnFail: {
        count: 200,
      },
    },
  }
);

export const documentIngestionWorker = new Worker<IngestionJobData>(
  DOCUMENT_INGESTION_QUEUE_NAME,
  async (job: Job<IngestionJobData>) => {
    const { documentId, filePath } = job.data;
    logger.info({ jobId: job.id, documentId }, "Processing document ingestion job");

    // Execute ingestion
    await ingestDocument({ documentId, filePath });
    return { documentId };
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

documentIngestionWorker.on("completed", (job) => {
  logger.info(
    { jobId: job.id, documentId: job.data.documentId },
    "Document ingestion job completed successfully"
  );
});

documentIngestionWorker.on("failed", async (job, err) => {
  const documentId = job?.data?.documentId;
  logger.error(
    { jobId: job?.id, documentId, err },
    "Document ingestion job failed"
  );

  if (documentId) {
    const failureReason = err instanceof Error ? err.message : String(err);
    try {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: "failed",
          failureReason,
        },
      });
    } catch {
      // Ignore if already updated
    }

    broadcastDocumentStatus(documentId, {
      status: "failed",
      failureReason,
    });
  }
});

export async function addDocumentIngestionJob(data: IngestionJobData): Promise<Job<IngestionJobData>> {
  logger.info({ documentId: data.documentId }, "Enqueuing document ingestion in BullMQ");
  return documentIngestionQueue.add("ingest", data, {
    jobId: `ingest-${data.documentId}`,
  });
}

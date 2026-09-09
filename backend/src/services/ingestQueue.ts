import {
  addDocumentIngestionJob,
  documentIngestionQueue,
  documentIngestionWorker,
  type IngestionJobData,
} from "./queue/documentQueue";

export {
  addDocumentIngestionJob,
  documentIngestionQueue,
  documentIngestionWorker,
  IngestionJobData,
};

// Legacy fallback shim for backward compatibility
export const ingestQueue = {
  add: async (fn: () => Promise<unknown>) => {
    return fn();
  },
};


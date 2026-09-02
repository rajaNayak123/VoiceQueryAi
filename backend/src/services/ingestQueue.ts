import PQueue from "p-queue";

export const ingestQueue = new PQueue({ concurrency: 2 });

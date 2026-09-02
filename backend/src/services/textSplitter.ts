import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import type { Document } from "@langchain/core/documents";
import type { ChunkWithMetadata } from "../types";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 150,
});

export async function splitIntoChunks(
  pages: Document[]
): Promise<ChunkWithMetadata[]> {
  const chunks: ChunkWithMetadata[] = [];

  for (const page of pages) {
    const pageNumber: number =
      (page.metadata?.loc?.pageNumber as number | undefined) ??
      (page.metadata?.pageNumber as number | undefined) ??
      1;

    const pieces = await splitter.splitText(page.pageContent);
    for (const text of pieces) {
      if (text.trim().length === 0) continue;
      chunks.push({ text, page: pageNumber });
    }
  }

  return chunks;
}

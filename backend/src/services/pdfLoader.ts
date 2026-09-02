import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import type { Document } from "@langchain/core/documents";

export async function loadPdfPages(filePath: string): Promise<Document[]> {
  const loader = new PDFLoader(filePath, { splitPages: true });
  const docs = await loader.load();
  return docs;
}

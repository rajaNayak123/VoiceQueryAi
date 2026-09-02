import path from "path";
import fs from "fs/promises";
import { documentsRepository } from "../repository/documents.repository";
import { ingestDocument } from "../../../services/ingest";
import { ingestQueue } from "../../../services/ingestQueue";
import { deleteCollection } from "../../../services/vectorStore";
import { AppError } from "../../../middleware/errorHandler";
import { UPLOAD_DIR } from "../../../middleware/upload";
import { logger } from "../../../utils/logger";

export const documentsService = {
  async handleUpload(file: Express.Multer.File) {
    const documentId = path.basename(file.filename, ".pdf");

    const document = await documentsRepository.create({
      id: documentId,
      filename: file.originalname,
    });

    void ingestQueue.add(() =>
      ingestDocument({ documentId, filePath: file.path })
    );

    return { documentId: document.id, status: document.status };
  },

  async getStatus(id: string) {
    const document = await documentsRepository.findById(id);
    if (!document) {
      throw new AppError(404, "Document not found");
    }
    return document;
  },

  async deleteDocument(id: string) {
    const document = await documentsRepository.findById(id);
    if (!document) {
      throw new AppError(404, "Document not found");
    }

    if (document.qdrantCollection) {
      try {
        await deleteCollection(document.qdrantCollection);
      } catch (err) {
        logger.warn({ err, id }, "Failed to delete Qdrant collection (continuing)");
      }
    }

    const filePath = path.join(UPLOAD_DIR, `${id}.pdf`);
    await fs.unlink(filePath).catch(() => {
    });

    await documentsRepository.delete(id);
  },
};

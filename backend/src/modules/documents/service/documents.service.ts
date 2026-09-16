import path from "path";
import fs from "fs/promises";
import { documentsRepository } from "../repository/documents.repository";
import { addDocumentIngestionJob } from "../../../services/queue/documentQueue";
import { deleteCollection, deleteDocumentPoints } from "../../../services/vectorStore";
import { AppError } from "../../../middleware/errorHandler";
import { UPLOAD_DIR } from "../../../middleware/upload";
import { logger } from "../../../utils/logger";

export const documentsService = {
  async handleUpload(file: Express.Multer.File, userId?: string) {
    const documentId = path.basename(file.filename, ".pdf");

    const document = await documentsRepository.create({
      id: documentId,
      filename: file.originalname,
      userId,
    });

    await addDocumentIngestionJob({
      documentId,
      filePath: file.path,
    });

    return { documentId: document.id, status: document.status };
  },

  async handleBatchUpload(files: Express.Multer.File[], userId?: string) {
    if (!files || files.length === 0) {
      throw new AppError(400, "No files provided for upload");
    }

    const uploaded = await Promise.all(
      files.map(async (file) => {
        const documentId = path.basename(file.filename, ".pdf");
        const doc = await documentsRepository.create({
          id: documentId,
          filename: file.originalname,
          userId,
        });
        await addDocumentIngestionJob({
          documentId,
          filePath: file.path,
        });
        return {
          documentId: doc.id,
          filename: doc.filename,
          status: doc.status,
        };
      })
    );

    return {
      documents: uploaded,
      documentId: uploaded[0].documentId,
      status: uploaded[0].status,
    };
  },

  async getStatus(id: string, userId?: string) {
    const document = await documentsRepository.findById(id);
    if (!document) {
      throw new AppError(404, "Document not found");
    }
    if (document.userId && document.userId !== userId) {
      throw new AppError(403, "You do not have permission to access this document");
    }
    return document;
  },

  async getFilePath(id: string, userId?: string) {
    const document = await documentsRepository.findById(id);
    if (!document) {
      throw new AppError(404, "Document not found");
    }
    if (document.userId && document.userId !== userId) {
      throw new AppError(403, "You do not have permission to access this document");
    }
    const filePath = path.join(UPLOAD_DIR, `${id}.pdf`);
    try {
      await fs.access(filePath);
    } catch {
      throw new AppError(404, "PDF file not found on disk");
    }
    return { filePath, filename: document.filename };
  },

  async deleteDocument(id: string, userId?: string) {
    const document = await documentsRepository.findById(id);
    if (!document) {
      throw new AppError(404, "Document not found");
    }
    if (document.userId && document.userId !== userId) {
      throw new AppError(403, "You do not have permission to delete this document");
    }

    if (document.qdrantCollection) {
      try {
        await deleteCollection(document.qdrantCollection);
      } catch (err) {
        logger.warn({ err, id }, "Failed to delete Qdrant collection (continuing)");
      }
    }

    try {
      await deleteDocumentPoints(id);
    } catch (err) {
      logger.warn({ err, id }, "Failed to delete points from multi-tenant collection (continuing)");
    }

    const filePath = path.join(UPLOAD_DIR, `${id}.pdf`);
    await fs.unlink(filePath).catch(() => {
    });

    await documentsRepository.delete(id);
  },

  async listUserDocuments(userId?: string) {
    if (!userId) return [];
    return documentsRepository.listByUser(userId);
  },
};

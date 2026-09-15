import { prisma } from "../../../config/db";
import type { Document } from "@prisma/client";

export const documentsRepository = {
  create(data: { id: string; filename: string; userId?: string }): Promise<Document> {
    return prisma.document.create({
      data: {
        id: data.id,
        filename: data.filename,
        userId: data.userId,
        status: "uploading",
      },
    });
  },

  findById(id: string): Promise<Document | null> {
    return prisma.document.findUnique({ where: { id } });
  },

  listByUser(userId: string): Promise<Document[]> {
    return prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  delete(id: string): Promise<Document> {
    return prisma.document.delete({ where: { id } });
  },
};

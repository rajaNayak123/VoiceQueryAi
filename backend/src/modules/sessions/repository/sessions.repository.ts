import { prisma } from "../../../config/db";
import type { Session } from "@prisma/client";

export const sessionsRepository = {
  create(data: { documentId: string; roomName: string }): Promise<Session> {
    return prisma.session.create({ data });
  },
};

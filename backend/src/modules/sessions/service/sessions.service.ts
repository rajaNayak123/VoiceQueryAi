import { v4 as uuidv4 } from "uuid";
import { documentsRepository } from "../../documents/repository/documents.repository";
import { sessionsRepository } from "../repository/sessions.repository";
import { AppError } from "../../../middleware/errorHandler";
import {
  roomService,
  agentDispatchClient,
  mintAccessToken,
  AGENT_NAME,
} from "../../../config/livekit";
import { env } from "../../../config/env";
import type { CreateSessionResponse } from "../../../types";
import { logger } from "../../../utils/logger";

import { MULTI_TENANT_COLLECTION } from "../../../services/vectorStore";

export interface CreateSessionParams {
  documentId?: string;
  documentIds?: string[];
  userId?: string;
}

export const sessionsService = {
  async createSession(
    param: string | CreateSessionParams,
    userIdArg?: string
  ): Promise<CreateSessionResponse> {
    let ids: string[] = [];
    let userId: string | undefined = userIdArg;

    if (typeof param === "string") {
      ids = [param];
    } else {
      userId = param.userId ?? userIdArg;
      if (param.documentIds && param.documentIds.length > 0) {
        ids = param.documentIds;
      } else if (param.documentId) {
        ids = [param.documentId];
      }
    }

    if (ids.length === 0) {
      throw new AppError(400, "At least one documentId is required");
    }

    // Fetch and validate all documents
    const documents = await Promise.all(
      ids.map(async (id) => {
        const doc = await documentsRepository.findById(id);
        if (!doc) {
          throw new AppError(404, `Document with id ${id} not found`);
        }
        if (doc.userId && doc.userId !== userId) {
          throw new AppError(403, `You do not have access to document ${doc.filename}`);
        }
        if (doc.status !== "ready") {
          throw new AppError(
            409,
            `Document "${doc.filename}" is not ready yet (status: ${doc.status})`
          );
        }
        return doc;
      })
    );

    const isComparison = documents.length > 1;
    const roomName = `room-${uuidv4()}`;
    const primaryDoc = documents[0];
    const combinedFilename = documents.map((d) => d.filename).join(" vs ");

    // Multi-tenant collection is used for multi-document comparisons
    const collection = isComparison
      ? MULTI_TENANT_COLLECTION
      : (primaryDoc.qdrantCollection || MULTI_TENANT_COLLECTION);

    const documentsSummary = documents.map((d) => ({
      id: d.id,
      filename: d.filename,
    }));

    // 1. Create the room explicitly, with room metadata the agent reads on join.
    await roomService.createRoom({
      name: roomName,
      metadata: JSON.stringify({
        collection,
        documentId: primaryDoc.id,
        documentIds: ids,
        documents: documentsSummary,
        filename: isComparison ? combinedFilename : primaryDoc.filename,
        isComparison,
        userId: userId ?? null,
      }),
    });

    await agentDispatchClient.createDispatch(roomName, AGENT_NAME, {
      metadata: JSON.stringify({
        documentId: primaryDoc.id,
        documentIds: ids,
        isComparison,
      }),
    });

    // 3. Mint an access token for the frontend user.
    const identity = userId ? `user-${userId}` : `user-${uuidv4()}`;
    const token = await mintAccessToken({ identity, roomName });

    // 4. Record the session (associated with primary document in DB).
    await sessionsRepository.create({ documentId: primaryDoc.id, roomName });

    logger.info(
      { roomName, documentIds: ids, isComparison },
      "Session created and agent dispatched"
    );

    return {
      token,
      roomName,
      livekitUrl: env.LIVEKIT_URL,
      documentId: primaryDoc.id,
      filename: isComparison ? combinedFilename : primaryDoc.filename,
      documentIds: ids,
      documents: documentsSummary,
      isComparison,
    };
  },
};

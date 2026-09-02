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

export const sessionsService = {
  async createSession(documentId: string): Promise<CreateSessionResponse> {
    const document = await documentsRepository.findById(documentId);

    if (!document) {
      throw new AppError(404, "Document not found");
    }
    if (document.status !== "ready") {
      throw new AppError(
        409,
        `Document is not ready yet (status: ${document.status})`
      );
    }

    const roomName = `room-${uuidv4()}`;

    // 1. Create the room explicitly, with room metadata the agent reads on join.
    await roomService.createRoom({
      name: roomName,
      metadata: JSON.stringify({
        collection: document.qdrantCollection,
        documentId: document.id,
        filename: document.filename,
      }),
    });

    await agentDispatchClient.createDispatch(roomName, AGENT_NAME, {
      metadata: JSON.stringify({ documentId: document.id }),
    });

    // 3. Mint an access token for the frontend user.
    const identity = `user-${uuidv4()}`;
    const token = await mintAccessToken({ identity, roomName });

    // 4. Record the session.
    await sessionsRepository.create({ documentId: document.id, roomName });

    logger.info({ roomName, documentId }, "Session created and agent dispatched");

    return { token, roomName, livekitUrl: env.LIVEKIT_URL };
  },
};

import {
  AccessToken,
  RoomServiceClient,
  AgentDispatchClient,
} from "livekit-server-sdk";
import { env } from "./env";

const livekitHttpUrl = env.LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(
  /^ws:\/\//,
  "http://"
);

export const roomService = new RoomServiceClient(
  livekitHttpUrl,
  env.LIVEKIT_API_KEY,
  env.LIVEKIT_API_SECRET
);

export const agentDispatchClient = new AgentDispatchClient(
  livekitHttpUrl,
  env.LIVEKIT_API_KEY,
  env.LIVEKIT_API_SECRET
);

export const AGENT_NAME = "pdf-rag-agent";

export async function mintAccessToken(params: {
  identity: string;
  roomName: string;
}): Promise<string> {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: params.identity,
  });
  at.addGrant({
    roomJoin: true,
    room: params.roomName,
    canPublish: true,
    canSubscribe: true,
  });
  return at.toJwt();
}

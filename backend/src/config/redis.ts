import type { ConnectionOptions } from "bullmq";
import { env } from "./env";
import { logger } from "../utils/logger";

function parseRedisConfig(): ConnectionOptions {
  try {
    if (env.REDIS_URL.startsWith("redis://") || env.REDIS_URL.startsWith("rediss://")) {
      const parsed = new URL(env.REDIS_URL);
      return {
        host: parsed.hostname || "127.0.0.1",
        port: parsed.port ? Number(parsed.port) : 6379,
        password: parsed.password || undefined,
        username: parsed.username || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      };
    }
  } catch (err) {
    logger.warn({ err }, "Could not parse REDIS_URL, falling back to host/port");
  }

  return {
    host: env.REDIS_HOST || "127.0.0.1",
    port: Number(env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

export const redisConnection: ConnectionOptions = parseRedisConfig();

// Entrypoint: starts the HTTP server.
import { env } from "./config/env";
import { createApp } from "./app";
import { logger } from "./utils/logger";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`Backend listening on http://localhost:${env.PORT}`);
});

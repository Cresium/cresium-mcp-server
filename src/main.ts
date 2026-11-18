import { loadConfig } from "./config.ts";
import { SERVICE_NAME } from "./constants.ts";
import { createApp } from "./http/app.ts";
import { createLogger } from "./logger.ts";

const config = loadConfig(process.env);
const logger = createLogger(config.logLevel);
if (!config.confirmationSecret) {
  logger.warn(
    "CONFIRMATION_SECRET is not set: production writes run without asking the person to confirm them",
  );
}
const app = createApp({ config, logger });

const server = app.listen(config.port, () => {
  logger.info(`${SERVICE_NAME} listening on ${config.baseUrl}`);
});

function shutdown(): void {
  server.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

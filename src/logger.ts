import type {
  DestinationStream,
  LevelWithSilent,
  Logger,
  LoggerOptions,
} from "pino";
import pino from "pino";

import { SERVICE_NAME } from "./constants.ts";
import { REDACTED_LOG_PATHS } from "./partner/constants.ts";

/** JSON lines on stdout, which SleakOps ships to Loki. */
export function createLogger(
  level: LevelWithSilent,
  destination?: DestinationStream,
): Logger {
  const options: LoggerOptions = {
    level,
    base: { service: SERVICE_NAME },
    redact: [...REDACTED_LOG_PATHS],
  };
  return pino(options, destination);
}

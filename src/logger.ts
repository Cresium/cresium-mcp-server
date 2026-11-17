import type {
  DestinationStream,
  LevelWithSilent,
  Logger,
  LoggerOptions,
} from "pino";
import pino from "pino";

/** JSON lines on stdout, which SleakOps ships to Loki. */
export function createLogger(
  level: LevelWithSilent,
  destination?: DestinationStream,
): Logger {
  const options: LoggerOptions = { level, base: { service: "cresium-mcp" } };
  return pino(options, destination);
}

import { createLogger } from "../../src/logger.ts";
import type { CapturedLogger } from "./types.ts";

export function captureLogger(): CapturedLogger {
  const lines: string[] = [];
  const logger = createLogger("info", {
    write: (line: string) => {
      lines.push(line);
    },
  });
  return { lines, logger };
}

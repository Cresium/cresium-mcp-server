import type { Logger } from "pino";

import type { Environment } from "../partner/types.ts";
import type { ToolDef } from "../tools/types.ts";

export interface McpEndpointOptions {
  readonly tools: readonly ToolDef[];
  readonly environment: Environment;
  readonly apiBaseUrl: string;
  readonly timeoutMs: number;
  readonly logger: Logger;
}

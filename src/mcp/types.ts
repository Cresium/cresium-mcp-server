import type { Logger } from "pino";

import type { Environment } from "../partner/types.ts";
import type { ConnectionGuard, ToolDef } from "../tools/types.ts";

export interface McpEndpointOptions {
  readonly tools: readonly ToolDef[];
  readonly environment: Environment;
  readonly apiBaseUrl: string;
  readonly timeoutMs: number;
  readonly ensureConnected: ConnectionGuard;
  readonly logger: Logger;
}

export interface PromptDef {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly text: string;
}

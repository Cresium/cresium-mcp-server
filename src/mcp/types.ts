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

/** A fixed task the agent offers in its prompt menu; `text` is sent as the user's message. */
export interface PromptDef {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly text: string;
}

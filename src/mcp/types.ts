import type { Logger } from "pino";

import type { Environment } from "../partner/types.ts";
import type { ConnectionGuard, ToolDef } from "../tools/types.ts";
import type { ACCESS_MODES } from "./constants.ts";

/** What a connection may do: everything its API key allows, or only reads. Chosen by the path the partner connects to. */
export type AccessMode = (typeof ACCESS_MODES)[number];

export interface McpEndpointOptions {
  readonly tools: readonly ToolDef[];
  readonly environment: Environment;
  readonly mode: AccessMode;
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
  /** What a read-only connection is given instead, or null when the prompt needs a write tool and is not offered. */
  readonly readOnlyText: string | null;
}

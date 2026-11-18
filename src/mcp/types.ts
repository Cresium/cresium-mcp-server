import type { Logger } from "pino";

import type { Environment } from "../partner/types.ts";
import type { AccessMode, ConnectionGuard, ToolDef } from "../tools/types.ts";

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

/** A POST body as the endpoint read it: parsed JSON, text the SDK must parse and answer, or not read at all. */
export type McpBody =
  | { readonly kind: "parsed"; readonly value: unknown }
  | { readonly kind: "unparsed"; readonly text: string }
  | { readonly kind: "tooLarge" }
  | { readonly kind: "untouched" };

import type { ToolContext } from "../tools/types.ts";
import type { HTTP_METHODS } from "./constants.ts";

export type JsonSchema = Readonly<Record<string, unknown>>;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface OperationParameter {
  readonly name: string;
  readonly in: "path" | "query";
  readonly required: boolean;
  readonly description: string;
  readonly schema: unknown;
}

/** One V3 endpoint, trimmed from Cresium/bible's OpenAPI by scripts/generate-spec.ts. */
export interface Operation {
  /** `METHOD /path`, e.g. `GET /v3/balance/`. Agents pass it back to the read/write tools. */
  readonly id: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly summary: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly parameters: readonly OperationParameter[];
  /** JSON schema of the request body, or null when the endpoint takes none. */
  readonly body: JsonSchema | null;
}

/** An operation with its text ready to match: lowercase, without accents. */
export interface SearchableOperation {
  readonly operation: Operation;
  /** Id, summary and tags. */
  readonly title: string;
  readonly description: string;
}

/** Resolves when the session's credentials are accepted by Cresium; throws a ToolError otherwise. */
export type ConnectionGuard = (ctx: ToolContext) => Promise<void>;

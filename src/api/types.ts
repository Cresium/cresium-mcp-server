import type { Operation } from "../cresium/types.ts";

export interface SearchableOperation {
  readonly operation: Operation;
  readonly title: string;
  readonly summary: string;
  readonly description: string;
}

/** An answer cut down to the fields the agent asked for. */
export interface Projection {
  readonly value: unknown;
  /** Paths that matched nothing in any item. */
  readonly unmatched: readonly string[];
}

/** The sentences of the API tools that depend on whether the connection can write. */
export interface WriteGuidance {
  /** Ends search_api's description: which tools to call with what it finds. */
  readonly beforeCalling: string;
  /** In read_api's description, where to go to write. */
  readonly readDescription: string;
  /** Follows the operation id when read_api is asked for a write. */
  readonly readWrongAccess: string;
}

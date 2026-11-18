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

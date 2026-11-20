import type { Operation } from "../cresium/types.ts";

export interface SearchableOperation {
  readonly operation: Operation;
  readonly title: string;
  readonly summary: string;
  readonly description: string;
}

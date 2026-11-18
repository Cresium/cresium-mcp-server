import type { Operation } from "../cresium/types.ts";
import type { ToolContext } from "../tools/types.ts";

export interface SearchableOperation {
  readonly operation: Operation;
  readonly title: string;
  readonly description: string;
}

export type ConnectionGuard = (ctx: ToolContext) => Promise<void>;

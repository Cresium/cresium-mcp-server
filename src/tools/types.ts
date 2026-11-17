import type { Logger } from "pino";
import type { z } from "zod";

import type { PartnerSession } from "../partner/types.ts";

export type ToolAccess = "read" | "write";

export type ToolName = `${string}_${string}`;

export interface ToolContext {
  readonly session: PartnerSession;
  /** Already bound to the environment, company and masked API key. */
  readonly logger: Logger;
  readonly signal: AbortSignal;
}

export interface ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape> {
  readonly name: ToolName;
  readonly description: string;
  readonly input: z.ZodObject<Shape>;
  readonly access: ToolAccess;
  run(input: z.infer<z.ZodObject<Shape>>, ctx: ToolContext): Promise<string>;
}

export interface ToolCall {
  readonly tool: ToolDef;
  readonly input: unknown;
  readonly context: ToolContext;
}

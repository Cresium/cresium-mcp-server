import type { Logger } from "pino";
import type { z } from "zod";

import type { PartnerSession } from "../partner/types.ts";

export type ToolAccess = "read" | "write";

export type ToolName = `${string}_${string}`;

export interface ToolContext {
  readonly session: PartnerSession;
  /** Already bound to the environment, company, masked API key. */
  readonly logger: Logger;
  readonly signal: AbortSignal;
}

export type ToolEffect =
  | { readonly access: "read" }
  | {
      readonly access: "write";
      /** Appended to a failure we cannot attribute, when the write may have been applied anyway. */
      readonly unknownOutcomeAdvice: string;
    };

export type ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape> =
  ToolEffect & {
    readonly name: ToolName;
    readonly description: string;
    readonly input: z.ZodObject<Shape>;
    run(input: z.infer<z.ZodObject<Shape>>, ctx: ToolContext): Promise<string>;
  };

export interface ToolCall {
  readonly tool: ToolDef;
  readonly input: unknown;
  readonly context: ToolContext;
}

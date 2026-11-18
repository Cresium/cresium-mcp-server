import type {
  InputRequiredResult,
  RequestStateCodec,
} from "@modelcontextprotocol/server";
import type { Logger } from "pino";
import type { z } from "zod";

import type { PartnerSession } from "../partner/types.ts";
import type { ACCESS_MODES } from "./constants.ts";

export type ToolAccess = "read" | "write";

export type AccessMode = (typeof ACCESS_MODES)[number];

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
      /** Can change or remove data that already exists, not only add new data. Clients may ask for confirmation. */
      readonly destructive: boolean;
      /** Running it twice with the same input leaves the same state as running it once. */
      readonly idempotent: boolean;
      /** Appended to a failure we cannot attribute, when the write may have been applied anyway. */
      readonly unknownOutcomeAdvice: string;
    };

/** What a person is asked before a write runs, and the effect their answer is bound to. */
export interface ConfirmationRequest {
  /** Spanish, shown to the person: everything the call will send, so their answer is about the real thing. */
  readonly message: string;
  /** The call's exact effect. An answer authorizes only a retry whose effect is this same text. */
  readonly effect: string;
}

/** A write tool's wish to be put to the person in production before it runs. */
export interface Confirmation<Input> {
  /** What to ask for this call, or undefined when it needs no confirmation (a dry run sends nothing). Throws a UserFacingError for a call that would be refused anyway. */
  request(
    input: Input,
    session: PartnerSession,
  ): ConfirmationRequest | undefined;
}

/** How a call can be put to the person: what the client answered and what the state it echoed back proves. */
export interface ConfirmationChannel {
  /** Seals what the call is bound to into the state the client echoes back with its answer. */
  readonly seal: (binding: string) => Promise<string>;
  /** The binding of the echoed state, which has passed verification; undefined when the call carried none. */
  readonly sealed: string | undefined;
  readonly answer: "accept" | "decline" | "cancel" | undefined;
}

/** What the sealed state carries: a digest of the call, never the call. */
export interface ConfirmationState {
  readonly binding: string;
}

export type ConfirmationCodec = RequestStateCodec<ConfirmationState>;

export type ConfirmationVerdict =
  | { readonly kind: "confirmed" }
  | { readonly kind: "declined" }
  | { readonly kind: "ask"; readonly result: InputRequiredResult };

/** Resolves when the session's credentials are accepted by Cresium; throws a UserFacingError otherwise. */
export type ConnectionGuard = (ctx: ToolContext) => Promise<void>;

export type ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape> =
  ToolEffect & {
    readonly name: ToolName;
    /** What a client shows people instead of the name. */
    readonly title: string;
    readonly description: string;
    /** Spanish: how to ask for less when the result was cut at the limit; a generic one when absent. */
    readonly narrowingAdvice?: string;
    /** Runs only for a partner whose credentials Cresium accepts, for a tool that does not call the API itself. */
    readonly requiresVerifiedPartner?: true;
    /** Only a write tool uses it: in production the person confirms the call before it runs, when the client can ask. */
    readonly confirmation?: Confirmation<z.infer<z.ZodObject<Shape>>>;
    readonly input: z.ZodObject<Shape>;
    run(input: z.infer<z.ZodObject<Shape>>, ctx: ToolContext): Promise<string>;
  };

export interface RunOptions {
  readonly timeoutMs: number;
  readonly ensureConnected: ConnectionGuard;
}

export interface ToolCall {
  readonly tool: ToolDef;
  readonly input: unknown;
  readonly context: ToolContext;
  /** Absent when the client cannot answer a question or the server has no secret to seal one. */
  readonly confirmation?: ConfirmationChannel | undefined;
}

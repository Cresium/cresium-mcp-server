import type { z } from "zod";

import type {
  Environment,
  PartnerCredentials,
  PartnerSession,
} from "../partner/types.ts";
import type { HTTP_METHODS } from "./constants.ts";
import type { operationSchema } from "./schema.ts";

export type HttpMethod = (typeof HTTP_METHODS)[number];

export type Operation = z.infer<typeof operationSchema>;

export type OperationParameter = Operation["parameters"][number];

export type JsonSchema = NonNullable<Operation["body"]>;

export type QueryValue =
  string | number | boolean | readonly (string | number)[];

/** What a caller supplies to run an operation: values for its path placeholders, its query and its body. */
export interface OperationCall {
  readonly pathParams: Readonly<Record<string, string | number>>;
  readonly query: Readonly<Record<string, QueryValue>>;
  readonly body?:
    Readonly<Record<string, unknown>> | readonly unknown[] | undefined;
}

export interface SignedFields {
  readonly timestamp: string;
  readonly method: HttpMethod;
  /** Path plus query string, exactly as sent. */
  readonly url: string;
  readonly body: string;
}

export interface CresiumRequest {
  readonly method: HttpMethod;
  readonly url: string;
  readonly body?: unknown;
}

export interface CresiumResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface CresiumTarget {
  readonly baseUrl: string;
  readonly credentials: PartnerCredentials;
}

/** A request as it would be sent, without credentials or a signature. */
export interface CresiumRequestPreview {
  readonly method: HttpMethod;
  readonly url: string;
  readonly body: unknown;
  readonly signedText: string;
}

/** What `callOperation` shows a dry run: the preview plus how to sign it. */
export interface CresiumDryRun extends CresiumRequestPreview {
  readonly dryRun: true;
  readonly environment: Environment;
  readonly note: string;
}

/** Who a call is made as, how to stop it, and where to report how it went. */
export interface CallContext {
  readonly session: PartnerSession;
  readonly signal: AbortSignal;
  readonly onCall: (record: CallRecord) => void;
}

/** One request to the API, reported once it ends: `status` is "failed" when no answer arrived. */
export interface CallRecord {
  readonly operation: string;
  readonly status: number | "failed";
  readonly durationMs: number;
}

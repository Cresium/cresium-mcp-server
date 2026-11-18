import type { ValidateFunction } from "ajv";
import type { z } from "zod";

import type {
  Environment,
  PartnerCredentials,
  PartnerSession,
} from "../partner/types.ts";
import type { HTTP_METHODS } from "./constants.ts";
import type { operationSchema } from "./schema.ts";

export type HttpMethod = (typeof HTTP_METHODS)[number];

/** One V3 endpoint as operations.json lists it. */
export type CatalogueEntry = z.infer<typeof operationSchema>;

/** A catalogue entry whose body schema compiled when the catalogue loaded, so a call never compiles it. */
export interface Operation extends CatalogueEntry {
  /** Validates and coerces a body in place; undefined when the endpoint takes none. */
  readonly validateBody: ValidateFunction | undefined;
}

export type OperationParameter = CatalogueEntry["parameters"][number];

export type JsonSchema = NonNullable<CatalogueEntry["body"]>;

export type QueryValue =
  string | number | boolean | readonly (string | number)[];

/** What a caller supplies to run an operation: values for its path placeholders, its query and its body. */
export interface OperationCall {
  readonly pathParams: Readonly<Record<string, string | number>>;
  readonly query: Readonly<Record<string, QueryValue>>;
  readonly body?:
    Readonly<Record<string, unknown>> | readonly unknown[] | undefined;
}

/** A body field the operation's schema does not declare, e.g. `paymentOrder.expiresin`. */
export interface UnknownField {
  readonly path: string;
  /** Path of the object that holds it; "" for the body itself. */
  readonly parent: string;
  /** The fields that object's schema declares. */
  readonly known: readonly string[];
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

export type SignatureKind = "request" | "webhook";

/** What the partner's code used, as it went over the wire. */
export interface SignatureCheck {
  readonly kind: SignatureKind;
  readonly timestamp: string;
  /** Ignored for a webhook, which is always POST. */
  readonly method: HttpMethod;
  /** Request: path plus query string. Webhook: the full registered URL. */
  readonly url: string;
  /** Raw, as sent or received; empty when there is none. */
  readonly body: string;
  readonly signature: string;
}

/** Everything a known mistake needs to reproduce what a buggy client would have signed. */
export interface MistakeCase {
  readonly session: PartnerSession;
  readonly kind: SignatureKind;
  /** The values the formula expects for this kind, as mage or the webhook docs read them. */
  readonly fields: SignedFields;
  /** The body exactly as the partner gave it, before compacting. */
  readonly sentBody: string;
}

export interface SignatureMistake {
  readonly id: string;
  /** Spanish: what went wrong and how to fix it. */
  readonly explanation: string;
  /** The signature a client making this mistake computes from the same inputs; undefined when it cannot apply to them. */
  readonly forge: (input: MistakeCase) => string | undefined;
}

export type SignatureDiagnosis =
  | { readonly valid: true; readonly warnings: readonly string[] }
  | {
      readonly valid: false;
      readonly cause: Pick<SignatureMistake, "id" | "explanation">;
      readonly warnings: readonly string[];
    }
  | {
      readonly valid: false;
      /** Ids of the known mistakes that were tried and did not reproduce the signature. */
      readonly checked: readonly string[];
      readonly warnings: readonly string[];
    };

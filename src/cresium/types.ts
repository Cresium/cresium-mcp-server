import type { z } from "zod";

import type { HttpMethod } from "../api/types.ts";
import type { PartnerCredentials } from "../partner/types.ts";
import type { operationCallSchema } from "./schema.ts";

export interface SignedFields {
  readonly timestamp: string;
  readonly method: HttpMethod;
  /** Path plus query string, exactly as sent. */
  readonly url: string;
  /** JSON body as sent, or "" when there is none. */
  readonly body: string;
}

export type OperationCall = z.infer<typeof operationCallSchema>;

export type QueryValue = OperationCall["query"][string];

export interface CresiumRequest {
  readonly method: HttpMethod;
  readonly url: string;
  readonly body?: unknown;
}

export interface CresiumResponse {
  readonly status: number;
  /** Parsed JSON, or the raw text when the API did not answer JSON. */
  readonly body: unknown;
}

export interface CresiumTarget {
  readonly baseUrl: string;
  readonly credentials: PartnerCredentials;
}

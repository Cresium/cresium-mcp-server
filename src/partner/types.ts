import type { ENVIRONMENTS } from "./constants.ts";

/** Which Cresium API a request targets. Chosen by the URL path the partner connects to. */
export type Environment = (typeof ENVIRONMENTS)[number];

/** The partner's V3 API credentials, read from request headers and never stored or logged. */
export interface PartnerCredentials {
  readonly apiKey: string;
  readonly secret: string;
  readonly companyId: string;
}

export type CredentialsResult =
  | { readonly ok: true; readonly credentials: PartnerCredentials }
  | { readonly ok: false; readonly problems: readonly string[] };

/** Who is calling and against which Cresium API, fixed for one MCP request. */
export interface PartnerSession {
  readonly environment: Environment;
  readonly apiBaseUrl: string;
  readonly credentials: PartnerCredentials;
}

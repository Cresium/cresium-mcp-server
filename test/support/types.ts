import type { Client, ClientOptions } from "@modelcontextprotocol/client";
import type { Logger } from "pino";

import type { Environment } from "../../src/partner/types.ts";

export interface ReceivedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  readonly body: string;
  readonly signatureValid: boolean;
}

export interface FakeReply {
  readonly status: number;
  readonly body: string;
}

export interface FakeCresium {
  readonly baseUrl: string;
  readonly received: ReceivedRequest[];
  reply(next: FakeReply): void;
  stop(): Promise<void>;
}

/** A path the app serves MCP on: an environment, or its read-only variant. */
export type Route = Environment | `${Environment}/read-only`;

export interface RunningApp {
  readonly url: string;
  readonly logLines: string[];
  connect(
    route: Route,
    headers: Record<string, string>,
    options?: ClientOptions,
  ): Promise<Client>;
  stop(): void;
}

export interface AppUrls {
  readonly sandbox: string;
  readonly production: string;
  readonly docs: string;
}

export interface CapturedLogger {
  readonly lines: string[];
  readonly logger: Logger;
}

export interface ToolText {
  readonly isError: boolean;
  readonly text: string;
}

/** One partner phrasing and what `search_api` must answer for it. */
export type SearchGolden = { readonly phrase: string } & (
  | { readonly top3: string }
  | { readonly none: true }
  | { readonly notFirst: string }
);

export interface GzipUpstreamOptions {
  readonly honorsAcceptEncoding: boolean;
}

export interface GzipUpstream {
  readonly baseUrl: string;
  readonly compressedBytes: number;
  readonly smallAnswer: string;
  /** The Accept-Encoding of every request it got; "" when absent. */
  readonly acceptEncodings: readonly string[];
  stop(): Promise<void>;
}

export interface EndlessUpstream {
  readonly baseUrl: string;
  /** What the server produced, and whether the client closed the connection. */
  readonly state: { sentBytes: number; cancelled: boolean };
  stop(): Promise<void>;
}

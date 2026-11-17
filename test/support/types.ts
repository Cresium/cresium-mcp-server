import type { Client } from "@modelcontextprotocol/client";

import type { Environment } from "../../src/partner/types.ts";

export interface ReceivedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  readonly body: string;
  /** Whether the signature passes mage's check: HMAC over `timestamp|METHOD|url|JSON.stringify(parsed body)`. */
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

export interface RunningApp {
  readonly url: string;
  /** Every JSON line the app logged. */
  readonly logLines: string[];
  connect(
    environment: Environment,
    headers: Record<string, string>,
  ): Promise<Client>;
  stop(): void;
}

export interface AppUrls {
  readonly sandbox: string;
  readonly production: string;
  readonly docs: string;
}

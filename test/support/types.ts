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

export interface RunningApp {
  readonly url: string;
  readonly logLines: string[];
  connect(
    environment: Environment,
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

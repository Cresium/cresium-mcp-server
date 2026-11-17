import type { Client } from "@modelcontextprotocol/client";

import type { Environment } from "../../src/partner/types.ts";

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
}

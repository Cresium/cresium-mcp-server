import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

import { loadConfig } from "../../src/config.ts";
import { createApp } from "../../src/http/app.ts";
import { captureLogger } from "./capture-logger.ts";
import type { AppUrls, RunningApp } from "./types.ts";

export async function startApp(urls: AppUrls): Promise<RunningApp> {
  const config = loadConfig({
    MCP_BASE_URL: "http://localhost:3000",
    CRESIUM_SANDBOX_API_URL: urls.sandbox,
    CRESIUM_PRODUCTION_API_URL: urls.production,
    CRESIUM_DOCS_URL: urls.docs,
    TOOL_TIMEOUT_MS: "5000",
  });
  const { lines: logLines, logger } = captureLogger();
  const server: Server = createApp({ config, logger }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://localhost:${port}`;
  return {
    url,
    logLines,
    connect: async (route, headers, options) => {
      const client = new Client({ name: "app-test", version: "0" }, options);
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${url}/${route}`), {
          requestInit: { headers },
        }),
      );
      return client;
    },
    stop: () => {
      server.close();
    },
  };
}

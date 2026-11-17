import { afterAll, describe, expect, it } from "bun:test";
import type { AddressInfo } from "node:net";

import { loadConfig } from "../config.ts";
import { createLogger } from "../logger.ts";
import { createApp } from "./app.ts";

const server = createApp({
  config: loadConfig({ MCP_BASE_URL: "https://mcp.cresium.app" }),
  logger: createLogger("silent"),
}).listen(0);
const { port } = server.address() as AddressInfo;
const url = `http://localhost:${port}`;

afterAll(() => {
  server.close();
});

describe("HTTP", () => {
  it("[GET] /health - 200 - for a probe that sends the pod IP as Host", async () => {
    const response = await fetch(`${url}/health`, {
      headers: { host: "10.1.2.3:3000" },
    });
    expect(response.status).toBe(200);
  });

  it("[GET] /anything - 403 - for a Host that is not the public one", async () => {
    const response = await fetch(`${url}/anything`, {
      headers: { host: "evil.example" },
    });
    expect(response.status).toBe(403);
  });
});

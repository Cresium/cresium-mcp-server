// End-to-end against Cresium's sandbox: real MCP client -> this server -> api.develop.cresium.app and docs.cresium.com.
// Opt-in because it needs a sandbox API key and creates data there: `bun run test:sandbox` with CRESIUM_API_KEY,
// CRESIUM_SECRET and CRESIUM_COMPANY_ID in .env.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

import { loadConfig } from "../src/config.ts";
import { createApp } from "../src/http/app.ts";
import { createLogger } from "../src/logger.ts";
import { callTool } from "./support/call-tool.ts";
import type { ToolText } from "./support/types.ts";

const SANDBOX_API_URL = "https://api.develop.cresium.app";
const enabled = process.env["SANDBOX_IT"] === "1";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the sandbox test`);
  return value;
}

describe.if(enabled)("sandbox end to end", () => {
  let server: Server;
  let client: Client;

  function call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolText> {
    return callTool(client, name, args);
  }

  beforeAll(async () => {
    const config = loadConfig({
      MCP_BASE_URL: "http://localhost:3000",
      CRESIUM_SANDBOX_API_URL: SANDBOX_API_URL,
      CRESIUM_PRODUCTION_API_URL: "https://api.cresium.app",
      CRESIUM_DOCS_URL: "https://docs.cresium.com",
    });
    server = createApp({ config, logger: createLogger("silent") }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    client = new Client({ name: "sandbox-test", version: "0" });
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://localhost:${port}/sandbox`),
        {
          requestInit: {
            headers: {
              "x-api-key": requiredEnv("CRESIUM_API_KEY"),
              "x-api-secret": requiredEnv("CRESIUM_SECRET"),
              "x-company-id": requiredEnv("CRESIUM_COMPANY_ID"),
            },
          },
        },
      ),
    );
  });

  afterAll(async () => {
    await client.close();
    server.close();
  });

  it("lists the API and docs tools, marking reads as read-only", async () => {
    const { tools } = await client.listTools();
    const readOnly = tools
      .filter((tool) => tool.annotations?.readOnlyHint === true)
      .map((tool) => tool.name)
      .sort();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "check_connection",
      "read_api",
      "read_doc_page",
      "search_api",
      "search_docs",
      "send_docs_feedback",
      "write_api",
    ]);
    expect(readOnly).toEqual([
      "check_connection",
      "read_api",
      "read_doc_page",
      "search_api",
      "search_docs",
    ]);
  });

  it("check_connection confirms the sandbox credentials", async () => {
    const result = await call("check_connection", {});
    expect(result.isError).toBe(false);
    expect(result.text).toContain("SANDBOX");
  });

  it("reads the company's wallets with a valid signature", async () => {
    const result = await call("read_api", {
      operation: "GET /v3/balance/wallets",
    });
    expect(result.isError).toBe(false);
    expect(result.text).toContain('"availableBalance"');
  });

  it("sends array query parameters the way mage parses them", async () => {
    const result = await call("read_api", {
      operation: "GET /v3/transaction/search",
      query: { pageSize: 2, types: ["DEPOSIT"] },
    });
    expect(result.isError).toBe(false);
    expect(result.text).not.toContain('"WITHDRAWAL"');
  });

  // Needs the sandbox key to hold the deposit-address permission; without it Cresium answers 403.
  it("issues a CVU and simulates a deposit to it", async () => {
    const alias = `mcp.it.${Date.now().toString(36)}`;
    const created = await call("write_api", {
      operation: "POST /v3/deposit-address/cvu",
      body: { value: alias },
    });
    expect(created.isError).toBe(false);
    const cvu = (JSON.parse(created.text) as { data: { value: string } }).data
      .value;

    const deposit = await call("write_api", {
      operation: "POST /v3/sandbox/deposit",
      body: { cvu, amount: 1500 },
    });
    expect(deposit.isError).toBe(false);
    expect(deposit.text).toContain('"DEPOSIT"');
  });

  it("signs a write with a coerced body, so Cresium answers on the merits instead of 401", async () => {
    // amount as a string: mage coerces it before checking the signature, so it must be signed coerced or Cresium answers 401.
    const result = await call("write_api", {
      operation: "POST /v3/sandbox/deposit",
      body: { cvu: "0000003100000000000000", amount: "1" },
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Cresium respondió 400");
    expect(result.text).toContain("Deposit address not found");
  });

  it("searches the docs through Mintlify", async () => {
    const result = await call("search_docs", {
      query: "verificar firma webhook",
    });
    expect(result.isError).toBe(false);
    expect(result.text.toLowerCase()).toContain("webhook");
  });

  it("reads a docs page as Markdown", async () => {
    const result = await call("read_doc_page", { path: "sandbox" });
    expect(result.isError).toBe(false);
    expect(result.text).toContain("api.develop.cresium.app");
  });
});

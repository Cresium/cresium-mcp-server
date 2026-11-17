import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import type { Client } from "@modelcontextprotocol/client";

import { startFakeCresium } from "../../test/support/fake-cresium.ts";
import { startApp } from "../../test/support/start-app.ts";
import type { FakeCresium, RunningApp } from "../../test/support/types.ts";

const API_KEY = "0123456789abcdef0123456789abc017";
const SECRET = "super-secret-value-that-must-never-be-logged";
const HEADERS = {
  "x-api-key": API_KEY,
  "x-api-secret": SECRET,
  "x-company-id": "44",
};

let sandbox: FakeCresium;
let production: FakeCresium;
let app: RunningApp;

beforeAll(async () => {
  sandbox = startFakeCresium(SECRET);
  production = startFakeCresium(SECRET);
  app = await startApp({
    sandbox: sandbox.baseUrl,
    production: production.baseUrl,
    docs: "http://localhost:9",
  });
});

afterAll(async () => {
  app.stop();
  await sandbox.stop();
  await production.stop();
});

beforeEach(() => {
  sandbox.received.length = 0;
  production.received.length = 0;
  sandbox.reply({ status: 200, body: '{"data":{"ok":true}}' });
  app.logLines.length = 0;
});

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ isError: boolean; text: string }> {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  return { isError: result.isError === true, text };
}

describe("HTTP", () => {
  it("[GET] /health - 200", async () => {
    const response = await fetch(`${app.url}/health`);
    expect(response.status).toBe(200);
  });

  it("[POST] /sandbox - 401 - names the missing headers", async () => {
    const response = await fetch(`${app.url}/sandbox`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY },
      body: "{}",
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { message: string };
    expect(body.message).toContain("x-api-secret");
    expect(body.message).toContain("x-company-id");
  });

  it("[GET] /health - 200 - for a probe that sends the pod IP as Host", async () => {
    const response = await fetch(`${app.url}/health`, {
      headers: { host: "10.1.2.3:3000" },
    });
    expect(response.status).toBe(200);
  });

  it("[POST] /sandbox - 403 - for a Host that is not the public one", async () => {
    const response = await fetch(`${app.url}/sandbox`, {
      method: "POST",
      headers: { ...HEADERS, host: "evil.example" },
    });
    expect(response.status).toBe(403);
  });

  it("[POST] /sandbox - 401 - for a company id that is not a number", async () => {
    const response = await fetch(`${app.url}/sandbox`, {
      method: "POST",
      headers: { ...HEADERS, "x-company-id": "44 OR 1=1" },
    });
    expect(response.status).toBe(401);
  });

  it("[POST] /staging - 404 - only sandbox and production exist", async () => {
    const response = await fetch(`${app.url}/staging`, { method: "POST" });
    expect(response.status).toBe(404);
  });
});

describe("MCP over /sandbox and /production", () => {
  it("routes each path to its own Cresium API", async () => {
    const onSandbox = await app.connect("sandbox", HEADERS);
    const onProduction = await app.connect("production", HEADERS);
    await callTool(onSandbox, "read_api", {
      operation: "GET /v3/balance/wallets",
    });
    await callTool(onProduction, "read_api", {
      operation: "GET /v3/balance/wallets",
    });
    expect(sandbox.received).toHaveLength(1);
    expect(production.received).toHaveLength(1);
    expect(production.received[0]?.signatureValid).toBe(true);
    await onSandbox.close();
    await onProduction.close();
  });

  it("lets production write, like the API does", async () => {
    const client = await app.connect("production", HEADERS);
    const result = await callTool(client, "write_api", {
      operation: "POST /v3/deposit-address/cvu",
      body: { value: "cliente.01" },
    });
    expect(result.isError).toBe(false);
    expect(production.received[0]?.method).toBe("POST");
    await client.close();
  });

  it("never logs the secret or the full API key, and logs the call", async () => {
    const client = await app.connect("sandbox", HEADERS);
    sandbox.reply({ status: 500, body: `{"echo":"${SECRET}"}` });
    await callTool(client, "read_api", {
      operation: "GET /v3/balance/wallets",
    });
    await callTool(client, "read_api", { operation: "GET /v3/nope" });
    await client.close();

    const logged = app.logLines.join("");
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain(API_KEY);
    const apiCall = app.logLines
      .map((line) => JSON.parse(line) as { msg?: string })
      .find((entry) => entry.msg === "cresium api call");
    expect(apiCall).toMatchObject({
      environment: "sandbox",
      companyId: "44",
      apiKey: "****c017",
      operation: "GET /v3/balance/wallets",
      status: 500,
    });
  });
});

describe("API tools", () => {
  let client: Client;

  beforeAll(async () => {
    client = await app.connect("sandbox", HEADERS);
  });

  afterAll(async () => {
    await client.close();
  });

  it("search_api returns the operation id, access and body schema", async () => {
    const result = await callTool(client, "search_api", {
      query: "emitir cvu",
    });
    const [first] = JSON.parse(result.text) as {
      operation: string;
      access: string;
      body: unknown;
    }[];
    expect(first).toMatchObject({
      operation: "POST /v3/deposit-address/cvu",
      access: "write",
    });
    expect(first?.body).toBeTruthy();
  });

  it("read_api refuses a write operation without calling Cresium", async () => {
    const result = await callTool(client, "read_api", {
      operation: "POST /v3/deposit-address/cvu",
    });
    expect(result).toEqual({
      isError: true,
      text: "POST /v3/deposit-address/cvu escribe datos. Usá write_api para ejecutarla.",
    });
    expect(sandbox.received).toHaveLength(0);
  });

  it("write_api refuses a read operation", async () => {
    const result = await callTool(client, "write_api", {
      operation: "GET /v3/balance/wallets",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("read_api");
  });

  it("rejects a body on an operation that takes none", async () => {
    const result = await callTool(client, "write_api", {
      operation: "DELETE /v3/deposit-address/{address}",
      pathParams: { address: "123" },
      body: { x: 1 },
    });
    expect(result.isError).toBe(true);
    expect(sandbox.received).toHaveLength(0);
  });

  it("explains a 401 from Cresium in terms of the headers", async () => {
    sandbox.reply({ status: 401, body: '{"error":"UNAUTHORIZED"}' });
    const result = await callTool(client, "read_api", {
      operation: "GET /v3/balance/wallets",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("x-api-secret");
    expect(result.text).toContain("sandbox");
  });

  it("passes Cresium's error status and body to the agent", async () => {
    sandbox.reply({ status: 400, body: '{"error":"EXISTING_ALIAS"}' });
    const result = await callTool(client, "write_api", {
      operation: "POST /v3/deposit-address/cvu",
      body: { value: "ya.existe" },
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Cresium respondió 400");
    expect(result.text).toContain("EXISTING_ALIAS");
  });

  it("signs the body after coercing it the way mage's validation does", async () => {
    await callTool(client, "write_api", {
      operation: "POST /v3/sandbox/deposit",
      body: { cvu: "0000003100000000000001", amount: "1500" },
    });
    const [request] = sandbox.received;
    expect(request?.signatureValid).toBe(true);
    expect(JSON.parse(request?.body ?? "{}")).toMatchObject({ amount: 1500 });
  });

  it("rejects a body that breaks the operation's schema without calling Cresium", async () => {
    const result = await callTool(client, "write_api", {
      operation: "POST /v3/transaction/preview",
      body: {},
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("toId");
    expect(sandbox.received).toHaveLength(0);
  });

  it("rejects '..' as a path parameter", async () => {
    const result = await callTool(client, "read_api", {
      operation: "GET /v3/transaction/{id}",
      pathParams: { id: ".." },
    });
    expect(result.isError).toBe(true);
    expect(sandbox.received).toHaveLength(0);
  });

  it("warns the agent that a write answered with a 5xx may have been applied", async () => {
    sandbox.reply({ status: 504, body: '{"error":"GATEWAY_TIMEOUT"}' });
    const result = await callTool(client, "write_api", {
      operation: "POST /v3/deposit-address/cvu",
      body: { value: "cliente.02" },
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("antes de reintentar");
  });
});

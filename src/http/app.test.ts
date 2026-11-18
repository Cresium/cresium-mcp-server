import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import type { Client } from "@modelcontextprotocol/client";
import { DEFAULT_MAX_REQUEST_BODY_SIZE } from "@modelcontextprotocol/server";

import { callTool } from "../../test/support/call-tool.ts";
import { startFakeCresium } from "../../test/support/fake-cresium.ts";
import { startApp } from "../../test/support/start-app.ts";
import type { FakeCresium, RunningApp } from "../../test/support/types.ts";
import { API_WRITE_UNKNOWN_OUTCOME } from "../api/constants.ts";
import { OPERATIONS } from "../api/operations.ts";

const API_KEY = "0123456789abcdef0123456789abc017";
const SECRET = "super-secret-value-that-must-never-be-logged";
const HEADERS = {
  "x-api-key": API_KEY,
  "x-api-secret": SECRET,
  "x-company-id": "44",
};
const LEGACY_POST_HEADERS = {
  ...HEADERS,
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  "mcp-protocol-version": "2025-06-18",
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

  it("[POST] /production - 400 - refuses a JSON-RPC batch before any tool runs", async () => {
    const batch = [0, 1].map((id) => ({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: {
        name: "read_api",
        arguments: { operation: "GET /v3/balance/wallets" },
      },
    }));
    const response = await fetch(`${app.url}/production`, {
      method: "POST",
      headers: LEGACY_POST_HEADERS,
      body: JSON.stringify(batch),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "batch_not_supported",
      message:
        "Este servidor no acepta lotes de JSON-RPC: mandá un mensaje por pedido.",
    });
    expect(production.received).toHaveLength(0);
  });

  it("[POST] /production - 413 - for a body over the SDK's size limit", async () => {
    const response = await fetch(`${app.url}/production`, {
      method: "POST",
      headers: LEGACY_POST_HEADERS,
      body: `[${"0,".repeat(DEFAULT_MAX_REQUEST_BODY_SIZE / 2)}0]`,
      // The server answers before reading the body, so the half-sent connection must not be reused.
      keepalive: false,
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: `Payload Too Large: Request body must not exceed ${DEFAULT_MAX_REQUEST_BODY_SIZE} bytes`,
      },
      id: null,
    });
    expect(production.received).toHaveLength(0);
  });

  it("[POST] /production - 400 - answers a malformed JSON body with the SDK's own parse error", async () => {
    const response = await fetch(`${app.url}/production`, {
      method: "POST",
      headers: LEGACY_POST_HEADERS,
      body: '{"jsonrpc": "2.0",',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: { code: -32700, message: "Parse error: Invalid JSON" },
      id: null,
    });
    expect(production.received).toHaveLength(0);
  });

  it("[POST] /production - 415 - leaves a body that is not JSON to the SDK", async () => {
    const response = await fetch(`${app.url}/production`, {
      method: "POST",
      headers: { ...LEGACY_POST_HEADERS, "content-type": "text/plain" },
      body: "[1, 2]",
    });
    expect(response.status).toBe(415);
    expect(production.received).toHaveLength(0);
  });

  it("[POST] /production - 200 - runs a single tools/call without a session", async () => {
    const response = await fetch(`${app.url}/production`, {
      method: "POST",
      headers: LEGACY_POST_HEADERS,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "read_api",
          arguments: { operation: "GET /v3/balance/wallets" },
        },
      }),
    });
    expect(response.status).toBe(200);
    expect(production.received).toHaveLength(1);
  });

  it("[POST] /staging - 404 - only sandbox and production exist", async () => {
    const response = await fetch(`${app.url}/staging`, { method: "POST" });
    expect(response.status).toBe(404);
  });
});

describe("MCP over /sandbox and /production", () => {
  it.each([
    ["legacy", {}],
    ["modern", { versionNegotiation: { mode: { pin: "2026-07-28" } } }],
  ] as const)(
    "serves single requests on the %s protocol era",
    async (era, options) => {
      const client = await app.connect("sandbox", HEADERS, options);
      expect(client.getProtocolEra()).toBe(era);
      const result = await callTool(client, "read_api", {
        operation: "GET /v3/balance/wallets",
      });
      expect(result).toEqual({ isError: false, text: '{"data":{"ok":true}}' });
      expect(sandbox.received).toHaveLength(1);
      await client.close();
    },
  );

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
      apiKeyMasked: "****c017",
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
    expect(result.text).not.toContain("x-api-key");
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

  it.each([
    ["an unknown operation", { operation: "POST /v3/nope" }],
    ["a read operation", { operation: "GET /v3/balance/wallets" }],
    [
      "a missing path parameter",
      { operation: "PUT /v3/deposit-address/{address}", body: { value: "a" } },
    ],
    [
      "a path value that cannot be encoded",
      {
        operation: "DELETE /v3/deposit-address/{address}",
        pathParams: { address: "\uD800" },
      },
    ],
    [
      "a body the schema rejects",
      { operation: "POST /v3/transaction/preview", body: {} },
    ],
    [
      "an unknown body field",
      { operation: "POST /v3/deposit-address/cvu", body: { valor: "a" } },
    ],
    [
      "a body for an operation that takes none",
      {
        operation: "DELETE /v3/deposit-address/{address}",
        pathParams: { address: "1" },
        body: { x: 1 },
      },
    ],
  ])(
    "write_api refuses %s before sending, without saying the write may have been applied",
    async (_case, input) => {
      const result = await callTool(client, "write_api", input);
      expect(result.isError).toBe(true);
      expect(result.text).not.toContain(API_WRITE_UNKNOWN_OUTCOME);
      expect(sandbox.received).toHaveLength(0);
    },
  );

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

describe("an unreachable Cresium API", () => {
  let unreachable: RunningApp;
  let client: Client;

  beforeAll(async () => {
    const closed = Bun.serve({ port: 0, fetch: () => new Response() });
    const refusing = `http://localhost:${closed.port}`;
    await closed.stop(true);
    unreachable = await startApp({
      sandbox: refusing,
      production: refusing,
      docs: "http://localhost:9",
    });
    client = await unreachable.connect("sandbox", HEADERS);
  });

  afterAll(async () => {
    await client.close();
    unreachable.stop();
  });

  const NO_ANSWER =
    "La API de Cresium no respondió: no se pudo conectar o se cortó la conexión. Ambiente conectado: SANDBOX (pruebas, sin plata real).";

  it("tells the agent on a read that the API did not answer, and logs why", async () => {
    unreachable.logLines.length = 0;
    const result = await callTool(client, "read_api", {
      operation: "GET /v3/balance/wallets",
    });
    expect(result).toEqual({ isError: true, text: NO_ANSWER });
    const failures = unreachable.logLines
      .map((line) => JSON.parse(line) as { level: number; err?: unknown })
      .filter(({ level, err }) => level >= 40 && err != null);
    expect(failures).toHaveLength(1);
  });

  it("tells the agent on a write that Cresium may have applied it", async () => {
    const result = await callTool(client, "write_api", {
      operation: "POST /v3/deposit-address/cvu",
      body: { value: "cliente.03" },
    });
    expect(result).toEqual({
      isError: true,
      text: `${NO_ANSWER} ${API_WRITE_UNKNOWN_OUTCOME}`,
    });
  });
});

describe("connection, dry run and tracing", () => {
  let client: Client;

  beforeAll(async () => {
    client = await app.connect("production", HEADERS);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    production.reply({ status: 200, body: '{"data":{"ok":true}}' });
  });

  it("tells the agent which environment it is connected to", async () => {
    expect(client.getInstructions()).toContain("PRODUCCIÓN");
    const { tools } = await client.listTools();
    const descriptions = Object.fromEntries(
      tools.map((tool) => [tool.name, tool.description ?? ""]),
    );
    expect(descriptions["write_api"]).toContain("PRODUCCIÓN");
    expect(descriptions["read_api"]).not.toContain("PRODUCCIÓN");
  });

  it("offers the integration prompts", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name).sort()).toEqual([
      "depurar_firma",
      "integrar_cvus_dedicados",
    ]);
    const { messages } = await client.getPrompt({ name: "depurar_firma" });
    expect(messages[0]?.content).toMatchObject({ type: "text" });
  });

  it("check_connection confirms the environment, the company and the masked key", async () => {
    const result = await callTool(client, "check_connection", {});
    expect(result.isError).toBe(false);
    expect(result.text).toContain("PRODUCCIÓN");
    expect(result.text).toContain("Empresa: 44");
    expect(result.text).toContain("****c017");
    expect(result.text).not.toContain(API_KEY);
    expect(production.received[0]?.signatureValid).toBe(true);
  });

  it.each([
    [
      401,
      "Invalid signature when checking partner authentication",
      "x-api-secret",
    ],
    [
      401,
      "Company not found in partner when checking partner authentication",
      "x-company-id",
    ],
    [401, "Partner not found when finding by apiKey", "x-api-key no existe"],
    [
      401,
      "Company is not approved when checking partner authentication",
      "no está aprobada",
    ],
    [
      403,
      "Partner does not have permission to access this endpoint",
      "no tiene permiso",
    ],
  ])("check_connection explains %d %s", async (status, message, hint) => {
    const body = JSON.stringify({ code: status, error: "ERROR", message });
    production.reply({ status, body });
    const result = await callTool(client, "check_connection", {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain(hint);
  });

  it("returns the upstream transaction listing unchanged", async () => {
    const items = Array.from({ length: 10 }, (_, index) => ({
      id: index,
      description: "x".repeat(3_000),
    }));
    const sent = { data: { items } };
    production.reply({ status: 200, body: JSON.stringify(sent) });
    const result = await callTool(client, "read_api", {
      operation: "GET /v3/transaction/search",
    });
    expect(result.isError).toBe(false);
    expect(result.text).toBe(JSON.stringify(sent));
    expect(client.getInstructions()?.length).toBeLessThan(1_500);
  });

  it("a dry run returns the exact request and sends nothing", async () => {
    const result = await callTool(client, "write_api", {
      operation: "POST /v3/sandbox/deposit",
      body: { cvu: "0000003100000000000001", amount: "1500" },
      dryRun: true,
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({
      dryRun: true,
      environment: "production",
      method: "POST",
      url: `${production.baseUrl}/v3/sandbox/deposit`,
      body: { cvu: "0000003100000000000001", amount: 1500 },
      signedText:
        '<x-timestamp>|POST|/v3/sandbox/deposit|{"cvu":"0000003100000000000001","amount":1500}',
    });
    expect(JSON.parse(result.text)).toHaveProperty(
      "note",
      expect.stringContaining("No se envió nada"),
    );
    expect(result.text).not.toContain(SECRET);
    expect(production.received).toHaveLength(0);
  });

  it("search_api without a query lists every operation without its schema", async () => {
    const result = await callTool(client, "search_api", {});
    const entries = JSON.parse(result.text) as Record<string, unknown>[];
    expect(entries).toHaveLength(OPERATIONS.length);
    expect(Object.keys(entries[0] ?? {})).toEqual([
      "operation",
      "summary",
      "access",
    ]);
  });
});

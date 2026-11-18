import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import type { Client } from "@modelcontextprotocol/client";

import { API_WRITE_UNKNOWN_OUTCOME } from "../src/api/constants.ts";
import { MAX_RESULT_CHARS } from "../src/tools/constants.ts";
import { callTool } from "./support/call-tool.ts";
import { startEndlessUpstream } from "./support/endless-upstream.ts";
import { startFakeCresium } from "./support/fake-cresium.ts";
import { startApp } from "./support/start-app.ts";
import { transactionPage } from "./support/transaction.ts";
import type { FakeCresium, RunningApp } from "./support/types.ts";

const SECRET = "lean-secret";
const HEADERS = {
  "x-api-key": "0123456789abcdef0123456789abc017",
  "x-api-secret": SECRET,
  "x-company-id": "44",
};
const SEARCH = {
  operation: "GET /v3/transaction/search",
  query: { pageSize: 5 },
};

let fake: FakeCresium;
let app: RunningApp;
let client: Client;

beforeAll(async () => {
  fake = startFakeCresium(SECRET);
  app = await startApp({
    sandbox: fake.baseUrl,
    production: fake.baseUrl,
    docs: "http://localhost:9",
  });
  client = await app.connect("sandbox", HEADERS);
});

afterAll(async () => {
  await client.close();
  app.stop();
  await fake.stop();
});

beforeEach(() => {
  fake.reply({ status: 200, body: transactionPage(5) });
});

describe("read_api fields", () => {
  it("returns only the asked fields of each item and keeps the pagination", async () => {
    const result = await callTool(client, "read_api", {
      ...SEARCH,
      fields: ["id", "amount", "status"],
    });
    expect(result.isError).toBe(false);
    const parsed: unknown = JSON.parse(result.text);
    expect(parsed).toEqual({
      data: {
        items: Array.from({ length: 5 }, (_, index) => ({
          id: 1000 + index,
          amount: "1500.00",
          status: "COMPLETED",
        })),
        cursor: "abc",
        pageSize: 5,
        total: 120,
      },
    });
  });

  it("is far smaller than the full answer", async () => {
    const full = await callTool(client, "read_api", SEARCH);
    const lean = await callTool(client, "read_api", {
      ...SEARCH,
      fields: ["id", "amount", "status"],
    });
    expect(lean.text.length).toBeLessThan(full.text.length / 4);
  });

  it("names the paths that matched nothing after the JSON", async () => {
    const result = await callTool(client, "read_api", {
      ...SEARCH,
      fields: ["id", "amout", "counterparty.nombre"],
    });
    expect(result.isError).toBe(false);
    const [json, note] = result.text.split("\n\n");
    expect(JSON.parse(json ?? "")).toMatchObject({
      data: { cursor: "abc" },
    });
    expect(json).toContain('"items":[{"id":1000},{"id":1001}');
    expect(note).toContain("amout, counterparty.nombre");
    expect(note).not.toContain(" id");
  });

  it("leaves an error answer as Cresium sent it", async () => {
    fake.reply({ status: 404, body: '{"error":"NOT_FOUND"}' });
    const result = await callTool(client, "read_api", {
      ...SEARCH,
      fields: ["id"],
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('{"error":"NOT_FOUND"}');
    expect(result.text).not.toContain("coinciden");
  });

  it("leaves a text answer untouched", async () => {
    fake.reply({ status: 200, body: "plain text" });
    const result = await callTool(client, "read_api", {
      ...SEARCH,
      fields: ["id"],
    });
    expect(result).toEqual({ isError: false, text: '"plain text"' });
  });

  it("is not offered by write_api", async () => {
    const { tools } = await client.listTools();
    const shapes = Object.fromEntries(
      tools.map((tool) => [tool.name, tool.inputSchema.properties ?? {}]),
    );
    expect("fields" in (shapes["read_api"] ?? {})).toBe(true);
    expect("fields" in (shapes["write_api"] ?? {})).toBe(false);
  });
});

describe("the result limit", () => {
  it("cuts a listing that is too long and points at pageSize, filters and fields", async () => {
    fake.reply({ status: 200, body: transactionPage(150) });
    const result = await callTool(client, "read_api", SEARCH);
    expect(result.isError).toBe(false);
    expect(result.text).toContain("Resultado cortado");
    expect(result.text).toContain("pageSize");
    expect(result.text).toContain("fields");
    expect(result.text.length).toBeLessThan(MAX_RESULT_CHARS + 500);
  });

  it("does not cut a full page of 100 transactions", async () => {
    fake.reply({ status: 200, body: transactionPage(100) });
    const result = await callTool(client, "read_api", SEARCH);
    expect(result.text).not.toContain("Resultado cortado");
  });
});

describe("an upstream answer that never ends", () => {
  it("tells the agent a read was dropped and that a write may have been applied", async () => {
    const endless = startEndlessUpstream();
    const runaway = await startApp({
      sandbox: endless.baseUrl,
      production: endless.baseUrl,
      docs: endless.baseUrl,
    });
    const connected = await runaway.connect("sandbox", HEADERS);
    const read = await callTool(connected, "read_api", SEARCH);
    expect(read.isError).toBe(true);
    expect(read.text).toContain("2 MiB");
    const write = await callTool(connected, "write_api", {
      operation: "POST /v3/deposit-address/cvu",
      body: { value: "a.b" },
    });
    expect(write.isError).toBe(true);
    expect(write.text).toContain("La escritura se envió");
    expect(write.text).toContain(API_WRITE_UNKNOWN_OUTCOME);
    await connected.close();
    runaway.stop();
    await endless.stop();
  });
});

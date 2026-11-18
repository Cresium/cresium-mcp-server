import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import type { Client } from "@modelcontextprotocol/client";

import { callTool } from "./support/call-tool.ts";
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

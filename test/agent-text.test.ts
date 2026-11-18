import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import type { Client } from "@modelcontextprotocol/client";

import { findOperation, OPERATIONS } from "../src/api/operations.ts";
import { previewRequest } from "../src/cresium/client.ts";
import { toCresiumRequest } from "../src/cresium/request.ts";
import { formatDocsSearch } from "../src/docs/format.ts";
import { PROMPTS } from "../src/mcp/constants.ts";
import { callTool } from "./support/call-tool.ts";
import { startFakeCresium } from "./support/fake-cresium.ts";
import { startApp } from "./support/start-app.ts";
import type { FakeCresium, RunningApp } from "./support/types.ts";

const TOOL_NAME = /\b[a-z]+(?:_[a-z]+)+\b/g;
const OPERATION_ID = /\b(?:GET|POST|PUT|PATCH|DELETE) \/v3\/[\w/{}-]*[\w/}]/g;
const SECRET = "agent-text-secret";
const HEADERS = {
  "x-api-key": "0123456789abcdef0123456789abc017",
  "x-api-secret": SECRET,
  "x-company-id": "44",
};
// Each call reaches one agent-facing text: an error, a note or a hint.
const TOOL_CALLS: readonly {
  readonly reply?: { readonly status: number; readonly body: string };
  readonly name: string;
  readonly args: Record<string, unknown>;
}[] = [
  { name: "check_connection", args: {} },
  { name: "search_api", args: { query: "zzzz" } },
  { name: "read_api", args: { operation: "nope" } },
  { name: "read_api", args: { operation: "POST /v3/deposit-address/cvu" } },
  { name: "write_api", args: { operation: "GET /v3/balance/wallets" } },
  {
    name: "write_api",
    args: { operation: "POST /v3/transaction/preview", body: { toId: 5 } },
  },
  {
    name: "write_api",
    args: {
      operation: "POST /v3/sandbox/deposit",
      body: { cvu: "1", amount: 1, cvv: 2 },
    },
  },
  {
    name: "write_api",
    args: {
      operation: "DELETE /v3/deposit-address/{address}",
      pathParams: { address: ".." },
    },
  },
  {
    name: "write_api",
    args: {
      operation: "POST /v3/sandbox/deposit",
      body: { cvu: "1", amount: 1 },
      dryRun: true,
    },
  },
  {
    reply: { status: 504, body: "{}" },
    name: "write_api",
    args: { operation: "POST /v3/deposit-address/cvu", body: { value: "a" } },
  },
  {
    reply: { status: 401, body: '{"message":"Unauthorized"}' },
    name: "read_api",
    args: { operation: "GET /v3/balance/wallets" },
  },
  { name: "read_doc_page", args: { path: "no-existe" } },
  { name: "send_docs_feedback", args: { path: "sandbox", feedback: "typo" } },
];

let cresium: FakeCresium;
let app: RunningApp;
let client: Client;
const docs = Bun.serve({
  port: 0,
  fetch: () => new Response("not found", { status: 404 }),
});
const agentTexts: { source: string; text: string }[] = [];
const knownNames = new Set<string>();

function descriptionsIn(schema: unknown): readonly string[] {
  if (schema == null || typeof schema !== "object") return [];
  return Object.entries(schema).flatMap(([key, value]) =>
    key === "description" && typeof value === "string"
      ? [value]
      : descriptionsIn(value),
  );
}

async function collectTools(): Promise<void> {
  const { tools } = await client.listTools();
  for (const tool of tools) {
    knownNames.add(tool.name);
    agentTexts.push({
      source: `${tool.name} description`,
      text: tool.description ?? "",
    });
    for (const text of descriptionsIn(tool.inputSchema)) {
      agentTexts.push({ source: `${tool.name} input`, text });
    }
  }
}

async function collectPrompts(): Promise<void> {
  const { prompts } = await client.listPrompts();
  for (const prompt of prompts) {
    knownNames.add(prompt.name);
    const { messages } = await client.getPrompt({ name: prompt.name });
    const text = messages
      .map(({ content }) => (content.type === "text" ? content.text : ""))
      .join("\n");
    agentTexts.push(
      { source: `${prompt.name} description`, text: prompt.description ?? "" },
      { source: `${prompt.name} text`, text },
    );
  }
}

async function collectToolAnswers(): Promise<void> {
  // A renamed tool is reported by the name checks below, not as a failed call here.
  for (const { reply, name, args } of TOOL_CALLS.filter(({ name }) =>
    knownNames.has(name),
  )) {
    cresium.reply(reply ?? { status: 200, body: '{"data":true}' });
    const { text } = await callTool(client, name, args);
    agentTexts.push({
      source: `${name} answer to ${JSON.stringify(args)}`,
      text,
    });
  }
}

beforeAll(async () => {
  cresium = startFakeCresium(SECRET);
  app = await startApp({
    sandbox: cresium.baseUrl,
    production: cresium.baseUrl,
    docs: `http://localhost:${docs.port}`,
  });
  client = await app.connect("sandbox", HEADERS);
  agentTexts.push({
    source: "server instructions",
    text: client.getInstructions() ?? "",
  });
  await collectTools();
  await collectPrompts();
  await collectToolAnswers();
  const longBlock = `Page: sandbox\n${"x".repeat(2_000)}`;
  agentTexts.push({
    source: "docs search format",
    text: formatDocsSearch(Array.from({ length: 6 }, () => longBlock)),
  });
});

afterAll(async () => {
  await client.close();
  app.stop();
  await cresium.stop();
  await docs.stop(true);
});

describe("names mentioned in agent-facing text", () => {
  it("collects the texts of the tools and prompts the server really has", () => {
    for (const name of ["check_connection", "read_api", "depurar_firma"]) {
      expect(knownNames.has(name)).toBe(true);
    }
    for (const { name } of TOOL_CALLS) expect(knownNames.has(name)).toBe(true);
    expect(agentTexts.length).toBeGreaterThan(TOOL_CALLS.length);
  });

  it("names only tools and prompts that exist", () => {
    for (const { source, text } of agentTexts) {
      for (const name of text.match(TOOL_NAME) ?? []) {
        expect(
          knownNames.has(name),
          `${source} mentions ${name}, which is no tool or prompt`,
        ).toBe(true);
      }
    }
  });

  it("names only operations that exist in the bundled catalogue", () => {
    const knownOperations = new Set(OPERATIONS.map(({ id }) => id));
    for (const { source, text } of agentTexts) {
      for (const id of text.match(OPERATION_ID) ?? []) {
        expect(
          knownOperations.has(id),
          `${source} mentions ${id}, which is no bundled operation`,
        ).toBe(true);
      }
    }
  });
});

it("the signature prompt uses the same encoded list query as signedText", () => {
  const request = toCresiumRequest(
    findOperation("GET /v3/transaction/search"),
    {
      pathParams: {},
      query: { types: ["DEPOSIT"] },
    },
  );
  const preview = previewRequest("http://localhost", request);
  const example = "types%5B%5D=DEPOSIT";
  expect(preview.signedText).toContain(example);
  expect(PROMPTS.find(({ name }) => name === "depurar_firma")?.text).toContain(
    example,
  );
});

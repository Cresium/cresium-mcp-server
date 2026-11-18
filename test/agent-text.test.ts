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
  {
    name: "diagnose_signature",
    args: { kind: "request", timestamp: "1", url: "/v3/x", signature: "00" },
  },
  {
    name: "diagnose_signature",
    args: {
      kind: "request",
      method: "GET",
      timestamp: "1",
      url: "/v3/balance/wallets",
      signature: "00",
    },
  },
  { name: "read_doc_page", args: { path: "no-existe" } },
  { name: "send_docs_feedback", args: { path: "sandbox", feedback: "typo" } },
];

let cresium: FakeCresium;
let app: RunningApp;
let client: Client;
let readOnlyClient: Client;
const docs = Bun.serve({
  port: 0,
  fetch: () => new Response("not found", { status: 404 }),
});
type RouteName = "full" | "read-only";
const ROUTES: readonly RouteName[] = ["full", "read-only"];
/** Each text with the route that serves it; null for a text every route can show. */
const agentTexts: { route: RouteName | null; source: string; text: string }[] =
  [];
/** The tools and prompts each route registers: a text may only name what its own route has. */
const knownNames: Record<RouteName, Set<string>> = {
  full: new Set(),
  "read-only": new Set(),
};

function descriptionsIn(schema: unknown): readonly string[] {
  if (schema == null || typeof schema !== "object") return [];
  return Object.entries(schema).flatMap(([key, value]) =>
    key === "description" && typeof value === "string"
      ? [value]
      : descriptionsIn(value),
  );
}

async function collectTools(from: Client, route: RouteName): Promise<void> {
  const { tools } = await from.listTools();
  for (const tool of tools) {
    knownNames[route].add(tool.name);
    agentTexts.push({
      route,
      source: `${route} ${tool.name} description`,
      text: tool.description ?? "",
    });
    for (const text of descriptionsIn(tool.inputSchema)) {
      agentTexts.push({ route, source: `${route} ${tool.name} input`, text });
    }
  }
}

async function collectPrompts(from: Client, route: RouteName): Promise<void> {
  const { prompts } = await from.listPrompts();
  for (const prompt of prompts) {
    knownNames[route].add(prompt.name);
    const { messages } = await from.getPrompt({ name: prompt.name });
    const text = messages
      .map(({ content }) => (content.type === "text" ? content.text : ""))
      .join("\n");
    agentTexts.push(
      {
        route,
        source: `${route} ${prompt.name} description`,
        text: prompt.description ?? "",
      },
      { route, source: `${route} ${prompt.name} text`, text },
    );
  }
}

async function collectToolAnswers(
  from: Client,
  route: RouteName,
): Promise<void> {
  // A renamed tool is reported by the name checks below, not as a failed call here.
  for (const { reply, name, args } of TOOL_CALLS.filter(({ name }) =>
    knownNames[route].has(name),
  )) {
    cresium.reply(reply ?? { status: 200, body: '{"data":true}' });
    const { text } = await callTool(from, name, args);
    agentTexts.push({
      route,
      source: `${route} ${name} answer to ${JSON.stringify(args)}`,
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
  readOnlyClient = await app.connect("sandbox/read-only", HEADERS);
  for (const [route, from] of [
    ["full", client],
    ["read-only", readOnlyClient],
  ] as const) {
    agentTexts.push({
      route,
      source: `${route} server instructions`,
      text: from.getInstructions() ?? "",
    });
    await collectTools(from, route);
    await collectPrompts(from, route);
    await collectToolAnswers(from, route);
  }
  const longBlock = `Page: sandbox\n${"x".repeat(2_000)}`;
  agentTexts.push({
    route: null,
    source: "docs search format",
    text: formatDocsSearch(Array.from({ length: 6 }, () => longBlock)),
  });
});

afterAll(async () => {
  await client.close();
  await readOnlyClient.close();
  app.stop();
  await cresium.stop();
  await docs.stop(true);
});

describe("names mentioned in agent-facing text", () => {
  it("collects the texts of the tools and prompts the server really has", () => {
    for (const name of [
      "check_connection",
      "diagnose_signature",
      "read_api",
      "depurar_firma",
    ]) {
      expect(knownNames.full.has(name)).toBe(true);
    }
    for (const { name } of TOOL_CALLS) {
      expect(knownNames.full.has(name)).toBe(true);
    }
    expect(agentTexts.length).toBeGreaterThan(TOOL_CALLS.length);
  });

  it("collects the read-only connection's own instructions, prompt and answers", () => {
    const sources = agentTexts.map(({ source }) => source);
    expect(sources).toContain("read-only server instructions");
    expect(sources).toContain("read-only depurar_firma text");
    expect(sources).toContain(
      'read-only read_api answer to {"operation":"POST /v3/deposit-address/cvu"}',
    );
  });

  it("names only tools and prompts that the route serving the text registers", () => {
    for (const { route, source, text } of agentTexts) {
      const routes = route ? [route] : ROUTES;
      for (const name of text.match(TOOL_NAME) ?? []) {
        for (const each of routes) {
          expect(
            knownNames[each].has(name),
            `${source} mentions ${name}, which ${each} does not register`,
          ).toBe(true);
        }
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

it("the signature prompt sends the agent to diagnose_signature first and keeps the manual comparison", () => {
  const text = PROMPTS.find(({ name }) => name === "depurar_firma")?.text ?? "";
  expect(text).toContain("diagnose_signature");
  expect(text.indexOf("diagnose_signature")).toBeLessThan(
    text.indexOf("dryRun: true"),
  );
  expect(text).toContain("signedText");
});

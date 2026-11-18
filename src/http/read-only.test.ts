import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

import { callTool } from "../../test/support/call-tool.ts";
import { startFakeCresium } from "../../test/support/fake-cresium.ts";
import { startApp } from "../../test/support/start-app.ts";
import type {
  FakeCresium,
  Route,
  RunningApp,
} from "../../test/support/types.ts";
import { PROMPTS } from "../mcp/constants.ts";

const SECRET = "super-secret-value-that-must-never-be-logged";
const HEADERS = {
  "x-api-key": "0123456789abcdef0123456789abc017",
  "x-api-secret": SECRET,
  "x-company-id": "44",
};
const READ_ONLY_ROUTES: readonly Route[] = [
  "sandbox/read-only",
  "production/read-only",
];
const FULL_ROUTES: readonly Route[] = ["sandbox", "production"];
const WRITE_TOOLS = ["write_api", "send_docs_feedback"];

let upstream: FakeCresium;
let app: RunningApp;

beforeAll(async () => {
  upstream = startFakeCresium(SECRET);
  app = await startApp({
    sandbox: upstream.baseUrl,
    production: upstream.baseUrl,
    docs: "http://localhost:9",
  });
});

afterAll(async () => {
  app.stop();
  await upstream.stop();
});

beforeEach(() => {
  upstream.received.length = 0;
  upstream.reply({ status: 200, body: '{"data":{"ok":true}}' });
});

for (const route of READ_ONLY_ROUTES) {
  describe(`read-only connection ${route}`, () => {
    it("offers every tool that only reads and no tool that writes", async () => {
      const client = await app.connect(route, HEADERS);
      const names = (await client.listTools()).tools.map(({ name }) => name);
      expect(names.sort()).toEqual([
        "check_connection",
        "diagnose_signature",
        "read_api",
        "read_doc_page",
        "search_api",
        "search_docs",
      ]);
      await client.close();
    });

    it("tells the agent it is read-only and how to get writes", async () => {
      const client = await app.connect(route, HEADERS);
      const instructions = client.getInstructions() ?? "";
      expect(instructions).toContain("solo lectura");
      expect(instructions).toContain("sin /read-only");
      await client.close();
    });

    it("answers the SDK's unknown-tool error when write_api is called by name", async () => {
      const client = await app.connect(route, HEADERS);
      const error = await callTool(client, "write_api", {
        operation: "POST /v3/deposit-address/cvu",
        body: {},
      }).then(
        (result) => (result.isError ? result.text : "no error"),
        (thrown: unknown) => String(thrown),
      );
      expect(error).toMatch(/Tool write_api not found/);
      expect(upstream.received).toHaveLength(0);
      await client.close();
    });

    it("still refuses a write operation in read_api, before any upstream call", async () => {
      const client = await app.connect(route, HEADERS);
      const result = await callTool(client, "read_api", {
        operation: "POST /v3/deposit-address/cvu",
      });
      expect(result.isError).toBe(true);
      expect(result.text).toContain("solo lectura");
      expect(result.text).toContain("sin /read-only");
      expect(upstream.received).toHaveLength(0);
      await client.close();
    });

    it("offers no prompt that needs a write tool", async () => {
      const client = await app.connect(route, HEADERS);
      const { prompts } = await client.listPrompts();
      expect(prompts.map(({ name }) => name)).toEqual(["depurar_firma"]);
      const text = JSON.stringify(
        await client.getPrompt({ name: "depurar_firma" }),
      );
      for (const tool of WRITE_TOOLS) expect(text).not.toContain(tool);
      await client.close();
    });
  });
}

for (const route of FULL_ROUTES) {
  describe(`default connection ${route}`, () => {
    it("keeps every tool and prompt, with no read-only notice", async () => {
      const client = await app.connect(route, HEADERS);
      const names = (await client.listTools()).tools.map(({ name }) => name);
      for (const tool of WRITE_TOOLS) expect(names).toContain(tool);
      expect((await client.listPrompts()).prompts).toHaveLength(PROMPTS.length);
      expect(client.getInstructions()).not.toContain("solo lectura");
      await client.close();
    });
  });
}

describe("routes", () => {
  it.each(["/sandbox/anything", "/production/read-only/extra", "/read-only"])(
    "[POST] %s - 404 - only the two suffixes exist",
    async (path) => {
      const response = await fetch(`${app.url}${path}`, {
        method: "POST",
        headers: HEADERS,
      });
      expect(response.status).toBe(404);
    },
  );
});

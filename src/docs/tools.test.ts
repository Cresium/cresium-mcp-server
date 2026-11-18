import { afterAll, beforeEach, describe, expect, it } from "bun:test";

import { startFakeCresium } from "../../test/support/fake-cresium.ts";
import { createConnectionGuard } from "../api/connection.ts";
import { API_WRITE_UNKNOWN_OUTCOME } from "../api/constants.ts";
import { createLogger } from "../logger.ts";
import type { PartnerCredentials } from "../partner/types.ts";
import { runTool } from "../tools/run.ts";
import type { ToolContext } from "../tools/types.ts";
import { DOCS_FEEDBACK_UNKNOWN_OUTCOME } from "./constants.ts";
import { createDocsTools } from "./tools.ts";

const SECRET = "the-real-secret";
const VALID: PartnerCredentials = {
  apiKey: "0123456789abcdef0123456789abc017",
  secret: SECRET,
  companyId: "44",
};
const UNAUTHORIZED_REPLY = {
  status: 401,
  body: '{"code":401,"error":"UNAUTHORIZED","message":"Invalid signature when checking partner authentication"}',
} as const;

const cresium = startFakeCresium(SECRET);
let docsRequests = 0;
const docs = Bun.serve({
  port: 0,
  fetch: () => {
    docsRequests += 1;
    return new Response("# Sandbox");
  },
});
const logger = createLogger("silent", { write: () => undefined });

afterAll(async () => {
  await cresium.stop();
  await docs.stop(true);
});

beforeEach(() => {
  cresium.received.length = 0;
  docsRequests = 0;
  cresium.reply({ status: 200, body: '{"data":true}' });
});

function contextFor(credentials: PartnerCredentials): ToolContext {
  return {
    session: {
      environment: "sandbox",
      apiBaseUrl: cresium.baseUrl,
      credentials,
    },
    logger,
    signal: new AbortController().signal,
  };
}

function runDocsTool(
  name: string,
  input: unknown,
  docsUrl = `http://localhost:${docs.port}`,
): ReturnType<typeof runTool> {
  const tool = createDocsTools(docsUrl).find(
    (candidate) => candidate.name === name,
  );
  if (!tool) throw new Error(`${name} is not registered`);
  return runTool(
    { tool, input, context: contextFor(VALID) },
    { timeoutMs: 5000, ensureConnected: createConnectionGuard() },
  );
}

describe("docs tools", () => {
  it.each([
    ["search_docs", { query: "sandbox" }],
    ["read_doc_page", { path: "sandbox" }],
    ["send_docs_feedback", { path: "sandbox", feedback: "typo" }],
  ])(
    "refuse made-up credentials in %s and never reach the docs server",
    async (name, input) => {
      cresium.reply(UNAUTHORIZED_REPLY);
      const result = await runDocsTool(name, input);
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain("x-api-secret");
      expect(docsRequests).toBe(0);
    },
  );

  it("does not say the report may have been sent when checking the credentials fails", async () => {
    const tool = createDocsTools(`http://localhost:${docs.port}`).find(
      ({ name }) => name === "send_docs_feedback",
    );
    if (!tool) throw new Error("send_docs_feedback is not registered");
    const unreachable = contextFor(VALID);
    const result = await runTool(
      {
        tool,
        input: { path: "sandbox", feedback: "typo" },
        context: {
          ...unreachable,
          session: { ...unreachable.session, apiBaseUrl: "http://localhost:9" },
        },
      },
      { timeoutMs: 5000, ensureConnected: createConnectionGuard() },
    );
    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "La API de Cresium no respondió: no se pudo conectar o se cortó la conexión. Ambiente conectado: SANDBOX (pruebas, sin plata real).",
        },
      ],
    });
    expect(docsRequests).toBe(0);
  });

  it("gives send_docs_feedback its own advice, not the API's, when it fails for an unknown reason", async () => {
    const result = await runDocsTool(
      "send_docs_feedback",
      { path: "sandbox", feedback: "typo" },
      "http://localhost:9",
    );
    const text = JSON.stringify(result);
    expect(result.isError).toBe(true);
    expect(text).toContain(DOCS_FEEDBACK_UNKNOWN_OUTCOME);
    expect(text).not.toContain(API_WRITE_UNKNOWN_OUTCOME);
  });
});

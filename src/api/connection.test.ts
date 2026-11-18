import { afterAll, beforeEach, describe, expect, it } from "bun:test";

import { startFakeCresium } from "../../test/support/fake-cresium.ts";
import { DOCS_FEEDBACK_UNKNOWN_OUTCOME } from "../docs/constants.ts";
import { createDocsTools } from "../docs/tools.ts";
import { createLogger } from "../logger.ts";
import type { Environment, PartnerCredentials } from "../partner/types.ts";
import { ToolError } from "../tools/errors.ts";
import { runTool } from "../tools/run.ts";
import type { ToolContext, ToolDef } from "../tools/types.ts";
import { createConnectionGuard } from "./connection.ts";

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
const OK_REPLY = { status: 200, body: '{"data":true}' } as const;
const EXPIRED_TTL_MS = 0;

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
  cresium.reply(OK_REPLY);
});

function contextFor(
  credentials: PartnerCredentials,
  environment: Environment = "sandbox",
): ToolContext {
  return {
    session: {
      environment,
      apiBaseUrl: cresium.baseUrl,
      credentials,
    },
    logger,
    signal: new AbortController().signal,
  };
}

function docsTool(
  name: string,
  ttlMs?: number,
  docsUrl = `http://localhost:${docs.port}`,
): ToolDef {
  const guard = createConnectionGuard(ttlMs);
  const tool = createDocsTools(docsUrl, guard).find(
    (candidate) => candidate.name === name,
  );
  if (!tool) throw new Error(`${name} is not registered`);
  return tool;
}

function readDocPage(ttlMs?: number): ToolDef {
  return docsTool("read_doc_page", ttlMs);
}

function readSandboxPage(
  tool: ToolDef,
  credentials: PartnerCredentials,
  environment?: Environment,
): Promise<string> {
  return tool.run({ path: "sandbox" }, contextFor(credentials, environment));
}

describe("docs tools connection guard", () => {
  it.each([
    ["search_docs", { query: "sandbox" }],
    ["read_doc_page", { path: "sandbox" }],
    ["send_docs_feedback", { path: "sandbox", feedback: "typo" }],
  ])(
    "refuses made-up credentials in %s and never reaches the docs server",
    async (name, input) => {
      cresium.reply(UNAUTHORIZED_REPLY);
      const error = await docsTool(name)
        .run(input, contextFor(VALID))
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(ToolError);
      expect(error).toHaveProperty(
        "message",
        expect.stringContaining("x-api-secret"),
      );
      expect(docsRequests).toBe(0);
    },
  );

  it("does not remember a failure", async () => {
    const tool = readDocPage();
    cresium.reply(UNAUTHORIZED_REPLY);
    await readSandboxPage(tool, VALID).catch(() => undefined);
    cresium.reply(OK_REPLY);
    expect(await readSandboxPage(tool, VALID)).toBe("# Sandbox");
    expect(cresium.received).toHaveLength(2);
  });

  it("runs for valid credentials and verifies them once", async () => {
    const tool = readDocPage();
    expect(await readSandboxPage(tool, VALID)).toBe("# Sandbox");
    expect(await readSandboxPage(tool, VALID)).toBe("# Sandbox");
    expect(cresium.received).toHaveLength(1);
    expect(cresium.received[0]?.signatureValid).toBe(true);
    expect(docsRequests).toBe(2);
  });

  it("verifies again once the remembered success has expired", async () => {
    const tool = readDocPage(EXPIRED_TTL_MS);
    await readSandboxPage(tool, VALID);
    await readSandboxPage(tool, VALID);
    expect(cresium.received).toHaveLength(2);
  });

  it("rejects a wrong secret for a key that was already verified", async () => {
    const tool = readDocPage();
    await readSandboxPage(tool, VALID);
    cresium.reply(UNAUTHORIZED_REPLY);
    const error = await readSandboxPage(tool, {
      ...VALID,
      secret: "guess",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ToolError);
    expect(error).toHaveProperty(
      "message",
      expect.stringContaining("x-api-secret"),
    );
    expect(cresium.received).toHaveLength(2);
  });

  it("verifies credentials again the first time they are used on another environment", async () => {
    const tool = readDocPage();
    await readSandboxPage(tool, VALID, "sandbox");
    await readSandboxPage(tool, VALID, "production");
    await readSandboxPage(tool, VALID, "production");
    expect(cresium.received).toHaveLength(2);
  });

  it("verifies again for a different API key with the same secret", async () => {
    const tool = readDocPage();
    await readSandboxPage(tool, VALID);
    await readSandboxPage(tool, { ...VALID, apiKey: "another-api-key" });
    expect(cresium.received).toHaveLength(2);
  });

  it("verifies again for a different company id with the same key and secret", async () => {
    const tool = readDocPage();
    await readSandboxPage(tool, VALID);
    await readSandboxPage(tool, { ...VALID, companyId: "45" });
    expect(cresium.received).toHaveLength(2);
  });

  it("gives send_docs_feedback its own advice, not the API's, when it fails for an unknown reason", async () => {
    const tool = docsTool(
      "send_docs_feedback",
      undefined,
      "http://localhost:9",
    );
    const result = await runTool(
      {
        tool,
        input: { path: "sandbox", feedback: "typo" },
        context: contextFor(VALID),
      },
      5000,
    );
    const text = JSON.stringify(result);
    expect(result.isError).toBe(true);
    expect(text).toContain(DOCS_FEEDBACK_UNKNOWN_OUTCOME);
    expect(text).not.toContain("transaction");
  });
});

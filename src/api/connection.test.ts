import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import * as z from "zod";

import { startFakeCresium } from "../../test/support/fake-cresium.ts";
import { UserFacingError } from "../errors.ts";
import { createLogger } from "../logger.ts";
import type { Environment, PartnerCredentials } from "../partner/types.ts";
import { defineTool } from "../tools/define.ts";
import { runTool } from "../tools/run.ts";
import type { ToolContext } from "../tools/types.ts";
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
let toolRuns = 0;
const guardedTool = defineTool({
  name: "test_guarded",
  description: "needs a verified partner",
  input: z.object({}),
  access: "read",
  requiresVerifiedPartner: true,
  run: () => {
    toolRuns += 1;
    return Promise.resolve("# Sandbox");
  },
});
const logger = createLogger("silent", { write: () => undefined });

afterAll(async () => {
  await cresium.stop();
});

beforeEach(() => {
  cresium.received.length = 0;
  toolRuns = 0;
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

function guardedRunner(ttlMs?: number) {
  const ensureConnected = createConnectionGuard(ttlMs);
  return async (
    credentials: PartnerCredentials,
    environment?: Environment,
  ): Promise<string> => {
    const result = await runTool(
      {
        tool: guardedTool,
        input: {},
        context: contextFor(credentials, environment),
      },
      { timeoutMs: 5000, ensureConnected },
    );
    const [first] = result.content;
    return first?.type === "text" ? first.text : "";
  };
}

describe("connection guard", () => {
  it("does not remember a failure", async () => {
    const run = guardedRunner();
    cresium.reply(UNAUTHORIZED_REPLY);
    await run(VALID);
    cresium.reply(OK_REPLY);
    expect(await run(VALID)).toBe("# Sandbox");
    expect(cresium.received).toHaveLength(2);
  });

  it("runs for valid credentials and verifies them once", async () => {
    const run = guardedRunner();
    expect(await run(VALID)).toBe("# Sandbox");
    expect(await run(VALID)).toBe("# Sandbox");
    expect(cresium.received).toHaveLength(1);
    expect(cresium.received[0]?.signatureValid).toBe(true);
    expect(toolRuns).toBe(2);
  });

  it("verifies again once the remembered success has expired", async () => {
    const run = guardedRunner(EXPIRED_TTL_MS);
    await run(VALID);
    await run(VALID);
    expect(cresium.received).toHaveLength(2);
  });

  it("rejects a wrong secret for a key that was already verified", async () => {
    const run = guardedRunner();
    await run(VALID);
    cresium.reply(UNAUTHORIZED_REPLY);
    const text = await run({ ...VALID, secret: "guess" });
    expect(text).toContain("x-api-secret");
    expect(toolRuns).toBe(1);
    expect(cresium.received).toHaveLength(2);
  });

  it("verifies credentials again the first time they are used on another environment", async () => {
    const run = guardedRunner();
    await run(VALID, "sandbox");
    await run(VALID, "production");
    await run(VALID, "production");
    expect(cresium.received).toHaveLength(2);
  });

  it("verifies again for a different API key with the same secret", async () => {
    const run = guardedRunner();
    await run(VALID);
    await run({ ...VALID, apiKey: "another-api-key" });
    expect(cresium.received).toHaveLength(2);
  });

  it("verifies again for a different company id with the same key and secret", async () => {
    const run = guardedRunner();
    await run(VALID);
    await run({ ...VALID, companyId: "45" });
    expect(cresium.received).toHaveLength(2);
  });

  it("refuses a partner Cresium rejects with an error the agent can read", async () => {
    cresium.reply(UNAUTHORIZED_REPLY);
    const ensureConnected = createConnectionGuard();
    const error = await ensureConnected(contextFor(VALID)).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(UserFacingError);
  });
});

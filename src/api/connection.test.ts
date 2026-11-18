import { afterAll, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { startFakeCresium } from "../../test/support/fake-cresium.ts";
import { UserFacingError } from "../errors.ts";
import { createLogger } from "../logger.ts";
import type { Environment, PartnerCredentials } from "../partner/types.ts";
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

const cresium = startFakeCresium(SECRET);
const logger = createLogger("silent", { write: () => undefined });

afterAll(async () => {
  await cresium.stop();
});

beforeEach(() => {
  cresium.received.length = 0;
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

function guard(ttlMs?: number) {
  const ensureConnected = createConnectionGuard(ttlMs);
  return (
    credentials: PartnerCredentials,
    environment?: Environment,
  ): Promise<void> => ensureConnected(contextFor(credentials, environment));
}

describe("connection guard", () => {
  it("does not remember a failure", async () => {
    const run = guard();
    cresium.reply(UNAUTHORIZED_REPLY);
    const error: unknown = await run(VALID).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UserFacingError);
    cresium.reply(OK_REPLY);
    await run(VALID);
    expect(cresium.received).toHaveLength(2);
  });

  it("runs for valid credentials and verifies them once", async () => {
    const run = guard();
    await run(VALID);
    await run(VALID);
    expect(cresium.received).toHaveLength(1);
    expect(cresium.received[0]?.signatureValid).toBe(true);
  });

  it("verifies again once the remembered success has expired", async () => {
    const clock = spyOn(Date, "now").mockReturnValue(1_000);
    try {
      const run = guard(100);
      await run(VALID);
      clock.mockReturnValue(1_099);
      await run(VALID);
      expect(cresium.received).toHaveLength(1);
      clock.mockReturnValue(1_100);
      await run(VALID);
      expect(cresium.received).toHaveLength(2);
    } finally {
      clock.mockRestore();
    }
  });

  it("rejects a wrong secret for a key that was already verified", async () => {
    const run = guard();
    await run(VALID);
    cresium.reply(UNAUTHORIZED_REPLY);
    const error: unknown = await run({ ...VALID, secret: "guess" }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(UserFacingError);
    expect(String(error)).toContain("x-api-secret");
    expect(cresium.received).toHaveLength(2);
  });

  it("verifies credentials again the first time they are used on another environment", async () => {
    const run = guard();
    await run(VALID, "sandbox");
    await run(VALID, "production");
    await run(VALID, "production");
    expect(cresium.received).toHaveLength(2);
  });

  it("verifies again for a different API key with the same secret", async () => {
    const run = guard();
    await run(VALID);
    await run({ ...VALID, apiKey: "another-api-key" });
    expect(cresium.received).toHaveLength(2);
  });

  it("verifies again for a different company id with the same key and secret", async () => {
    const run = guard();
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

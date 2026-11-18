import { afterAll, beforeEach, describe, expect, it } from "bun:test";

import { startFakeCresium } from "../../test/support/fake-cresium.ts";
import { UserFacingError } from "../errors.ts";
import type { PartnerSession } from "../partner/types.ts";
import { callOperation, previewOperation } from "./operation.ts";
import { compileOperation } from "./request.ts";
import type { CallRecord } from "./types.ts";

const SECRET = "shh-secret";
const fake = startFakeCresium(SECRET);
const session: PartnerSession = {
  environment: "sandbox",
  apiBaseUrl: fake.baseUrl,
  credentials: { apiKey: "key-1234", secret: SECRET, companyId: "44" },
};
const NO_PARAMS = { pathParams: {}, query: {} };
const BALANCE = compileOperation({
  id: "GET /v3/balance/",
  method: "GET",
  path: "/v3/balance/",
  summary: "",
  description: "",
  tags: [],
  parameters: [],
  body: null,
});
const PREVIEW = compileOperation({
  ...BALANCE,
  id: "POST /v3/transaction/preview",
  method: "POST",
  path: "/v3/transaction/preview",
  body: {
    type: "object",
    properties: {
      toId: { type: "number" },
      amount: { type: "string" },
      currencyCode: { type: "string" },
    },
    required: ["toId", "amount", "currencyCode"],
  },
});
const BODY = { toId: 5, amount: "1", currencyCode: "ARS" };

let records: CallRecord[] = [];
const context = {
  session,
  signal: new AbortController().signal,
  onCall: (record: CallRecord) => records.push(record),
};

afterAll(() => fake.stop());
beforeEach(() => {
  records = [];
  fake.received.length = 0;
  fake.reply({ status: 200, body: '{"data":true}' });
});

async function failure(promise: Promise<unknown>): Promise<UserFacingError> {
  const error: unknown = await promise.catch((thrown: unknown) => thrown);
  if (!(error instanceof UserFacingError)) throw new Error("did not fail");
  return error;
}

describe("callOperation", () => {
  it("returns the parsed body of a successful answer and reports the call", async () => {
    const body = await callOperation(context, BALANCE, NO_PARAMS);
    expect(body).toEqual({ data: true });
    expect(records).toEqual([
      {
        operation: "GET /v3/balance/",
        status: 200,
        durationMs: expect.any(Number) as number,
      },
    ]);
  });

  it("reports a call that got no answer as failed", async () => {
    const unreachable = {
      ...context,
      session: { ...session, apiBaseUrl: "http://localhost:9" },
    };
    await callOperation(unreachable, BALANCE, NO_PARAMS).catch(() => undefined);
    expect(records.map(({ status }) => status)).toEqual(["failed"]);
  });

  it("rethrows a cancelled call unchanged, so the tool runner can say it was cancelled", async () => {
    const cancelled = { ...context, signal: AbortSignal.abort() };
    const error: unknown = await callOperation(
      cancelled,
      BALANCE,
      NO_PARAMS,
    ).catch((thrown: unknown) => thrown);
    expect(error).not.toBeInstanceOf(UserFacingError);
    expect(error).toHaveProperty("name", "AbortError");
  });

  it("sends nothing and reports nothing for a request mage would reject", async () => {
    const error = await failure(
      callOperation(context, PREVIEW, { ...NO_PARAMS, body: { toId: 5 } }),
    );
    expect(error.message).toStartWith("Body inválido");
    expect(fake.received).toHaveLength(0);
    expect(records).toEqual([]);
  });

  it("explains a rejected signature with the environment line", async () => {
    fake.reply({ status: 401, body: '{"message":"Invalid signature"}' });
    const error = await failure(callOperation(context, BALANCE, NO_PARAMS));
    expect(error.message).toBe(
      'Cresium respondió 401: {"message":"Invalid signature"} x-api-secret no corresponde a esa x-api-key. Ambiente conectado: SANDBOX (pruebas, sin plata real).',
    );
    expect(error.outcomeUnknown).toBe(false);
  });

  it("points at the headers for any other 401", async () => {
    fake.reply({ status: 401, body: '{"message":"Unauthorized"}' });
    const error = await failure(callOperation(context, BALANCE, NO_PARAMS));
    expect(error.message).toContain("y que la key sea de sandbox.");
  });

  it("flags a write answered with a 5xx as possibly applied", async () => {
    fake.reply({ status: 500, body: "{}" });
    const error = await failure(
      callOperation(context, PREVIEW, { ...NO_PARAMS, body: BODY }),
    );
    expect(error.message).toBe("Cresium respondió 500: {}");
    expect(error.outcomeUnknown).toBe(true);
  });

  it("does not flag a read answered with a 5xx, nor a write answered with a 4xx", async () => {
    fake.reply({ status: 502, body: "{}" });
    expect(
      (await failure(callOperation(context, BALANCE, NO_PARAMS)))
        .outcomeUnknown,
    ).toBe(false);
    fake.reply({ status: 400, body: "{}" });
    const write = callOperation(context, PREVIEW, { ...NO_PARAMS, body: BODY });
    expect((await failure(write)).outcomeUnknown).toBe(false);
  });
});

describe("previewOperation", () => {
  it("shows the request after coercion and how to sign it, without sending", () => {
    const preview = previewOperation(session, PREVIEW, {
      ...NO_PARAMS,
      body: { toId: "5", amount: 10, currencyCode: "ARS" },
    });
    expect(Object.keys(preview)).toEqual([
      "dryRun",
      "environment",
      "method",
      "url",
      "body",
      "signedText",
      "note",
    ]);
    expect(preview.body).toEqual({
      toId: 5,
      amount: "10",
      currencyCode: "ARS",
    });
    expect(preview.url).toBe(`${fake.baseUrl}/v3/transaction/preview`);
    expect(fake.received).toHaveLength(0);
  });
});

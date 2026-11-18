import { afterAll, beforeEach, describe, expect, it } from "bun:test";

import { startFakeCresium } from "../../test/support/fake-cresium.ts";
import { USER_AGENT } from "../constants.ts";
import { callCresium, previewRequest, signRequest } from "./client.ts";

const credentials = {
  apiKey: "key-1234",
  secret: "shh-secret",
  companyId: "44",
};
const fake = startFakeCresium(credentials.secret);
const target = { baseUrl: fake.baseUrl, credentials };
const signal = new AbortController().signal;

afterAll(() => fake.stop());
beforeEach(() => {
  fake.received.length = 0;
  fake.reply({ status: 200, body: '{"data":true}' });
});

describe("signRequest", () => {
  it("matches a signature computed with mage's formula", () => {
    const signature = signRequest("secret", {
      timestamp: "2026-11-17T12:00:00.000Z",
      method: "GET",
      url: "/v3/health/",
      body: "",
    });
    // HMAC-SHA256("secret", "2026-11-17T12:00:00.000Z|GET|/v3/health/|") in base64.
    expect(signature).toBe("Zb6xDY2qklF72w3ACILxvXawqDJVf/f3gBbM2hWT58k=");
  });
});

describe("callCresium", () => {
  it("sends a GET mage accepts: signed, with credentials and no Content-Type", async () => {
    await callCresium(
      target,
      { method: "GET", url: "/v3/transaction/search?types%5B%5D=DEPOSIT" },
      signal,
    );
    const [request] = fake.received;
    expect(request?.signatureValid).toBe(true);
    expect(request?.headers.get("x-api-key")).toBe("key-1234");
    expect(request?.headers.get("x-company-id")).toBe("44");
    expect(request?.headers.get("content-type")).toBeNull();
    expect(request?.body).toBe("");
  });

  it("signs the JSON body exactly as mage re-serializes it", async () => {
    await callCresium(
      target,
      {
        method: "POST",
        url: "/v3/deposit-address/cvu",
        body: { value: "a.b", n: 1.5 },
      },
      signal,
    );
    const [request] = fake.received;
    expect(request?.signatureValid).toBe(true);
    expect(request?.headers.get("content-type")).toBe("application/json");
  });

  it("returns error statuses with their parsed body instead of throwing", async () => {
    fake.reply({ status: 403, body: '{"error":"FORBIDDEN"}' });
    const response = await callCresium(
      target,
      { method: "GET", url: "/v3/deposit-address/" },
      signal,
    );
    expect(response).toEqual({ status: 403, body: { error: "FORBIDDEN" } });
  });

  it("returns a non-JSON body as text", async () => {
    fake.reply({ status: 502, body: "Bad Gateway" });
    const response = await callCresium(
      target,
      { method: "GET", url: "/v3/health/" },
      signal,
    );
    expect(response).toEqual({ status: 502, body: "Bad Gateway" });
  });

  it("rejects when Cresium cannot be reached", async () => {
    const unreachable = { baseUrl: "http://localhost:9", credentials };
    const error: unknown = await callCresium(
      unreachable,
      { method: "GET", url: "/v3/health/" },
      signal,
    ).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("callCresium identification", () => {
  it("names itself with the User-Agent", async () => {
    await callCresium(target, { method: "GET", url: "/v3/balance/" }, signal);
    const [request] = fake.received;
    expect(request?.headers.get("user-agent")).toBe(USER_AGENT);
  });
});

describe("previewRequest", () => {
  it("shows the full URL, the body and the text to sign without calling Cresium", () => {
    const preview = previewRequest("https://api.develop.cresium.app", {
      method: "POST",
      url: "/v3/deposit-address/cvu",
      body: { value: "cliente.01" },
    });
    expect(preview).toEqual({
      method: "POST",
      url: "https://api.develop.cresium.app/v3/deposit-address/cvu",
      body: { value: "cliente.01" },
      signedText:
        '<x-timestamp>|POST|/v3/deposit-address/cvu|{"value":"cliente.01"}',
    });
    expect(fake.received).toHaveLength(0);
  });

  it("signs an empty body for a request without one, like mage does", () => {
    const preview = previewRequest("https://api.cresium.app", {
      method: "GET",
      url: "/v3/balance/",
    });
    expect(preview.body).toBeNull();
    expect(preview.signedText).toBe("<x-timestamp>|GET|/v3/balance/|");
  });
});

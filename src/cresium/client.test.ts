import { afterAll, beforeEach, describe, expect, it } from "bun:test";

import { startEndlessUpstream } from "../../test/support/endless-upstream.ts";
import { startFakeCresium } from "../../test/support/fake-cresium.ts";
import { startGzipUpstream } from "../../test/support/gzip-upstream.ts";
import { bytesHandedToReaders } from "../../test/support/reader-bytes.ts";
import { MAX_UPSTREAM_BODY_BYTES, USER_AGENT } from "../constants.ts";
import { UserFacingError } from "../errors.ts";
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
    expect(request?.headers.get("accept-encoding")).toBe("identity");
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

  it("names itself with the User-Agent", async () => {
    await callCresium(target, { method: "GET", url: "/v3/balance/" }, signal);
    const [request] = fake.received;
    expect(request?.headers.get("user-agent")).toBe(USER_AGENT);
  });
});

describe("callCresium with an answer that never ends", () => {
  const endless = startEndlessUpstream();
  const runaway = { baseUrl: endless.baseUrl, credentials };
  afterAll(() => endless.stop());

  async function failure(request: Parameters<typeof callCresium>[1]) {
    const error: unknown = await callCresium(runaway, request, signal).catch(
      (thrown: unknown) => thrown,
    );
    if (!(error instanceof UserFacingError)) throw new Error("did not fail");
    return error;
  }

  async function closed(): Promise<void> {
    for (let wait = 0; wait < 100 && !endless.state.cancelled; wait += 1) {
      await Bun.sleep(10);
    }
  }

  it("stops reading a read's answer past the limit and hangs up", async () => {
    const error = await failure({ method: "GET", url: "/v3/transaction/" });
    expect(error.message).toContain("2 MiB");
    expect(error.outcomeUnknown).toBe(false);
    await closed();
    expect(endless.state.cancelled).toBe(true);
    expect(endless.state.sentBytes).toBeLessThan(MAX_UPSTREAM_BODY_BYTES * 3);
  });

  it("flags a write whose answer was too large as sent, outcome unknown", async () => {
    const error = await failure({
      method: "POST",
      url: "/v3/deposit-address/cvu",
      body: { value: "a.b" },
    });
    expect(error.message).toContain("La escritura se envió");
    expect(error.outcomeUnknown).toBe(true);
  });
});

describe("callCresium with a compressed answer", () => {
  const honoring = startGzipUpstream({ honorsAcceptEncoding: true });
  const ignoring = startGzipUpstream({ honorsAcceptEncoding: false });
  afterAll(async () => {
    await honoring.stop();
    await ignoring.stop();
  });

  it("asks for an uncompressed answer, so a gzip body never inflates in memory", async () => {
    const target = { baseUrl: honoring.baseUrl, credentials };
    let body: unknown;
    const handed = await bytesHandedToReaders(async () => {
      ({ body } = await callCresium(
        target,
        { method: "GET", url: "/v3/transaction/" },
        signal,
      ));
    });
    expect(honoring.acceptEncodings).toEqual(["identity"]);
    expect(body).toEqual(JSON.parse(honoring.smallAnswer));
    expect(handed).toBe(honoring.smallAnswer.length);
  });

  it("refuses an answer compressed anyway without inflating it", async () => {
    const target = { baseUrl: ignoring.baseUrl, credentials };
    let error: unknown;
    const handed = await bytesHandedToReaders(async () => {
      error = await callCresium(
        target,
        {
          method: "POST",
          url: "/v3/deposit-address/cvu",
          body: { value: "a" },
        },
        signal,
      ).catch((thrown: unknown) => thrown);
    });
    expect(handed).toBeLessThanOrEqual(ignoring.compressedBytes);
    expect(error).toBeInstanceOf(UserFacingError);
    if (!(error instanceof UserFacingError)) return;
    expect(error.message).toContain("comprimid");
    expect(error.outcomeUnknown).toBe(true);
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

it("aborting callCresium closes its pending upstream HTTP request", async () => {
  const received = Promise.withResolvers<undefined>();
  const closed = Promise.withResolvers<undefined>();
  const server = Bun.serve({
    port: 0,
    fetch: (request) =>
      new Promise<Response>((resolve) => {
        request.signal.addEventListener(
          "abort",
          () => {
            closed.resolve(undefined);
            resolve(new Response(null));
          },
          { once: true },
        );
        received.resolve(undefined);
      }),
  });
  const controller = new AbortController();
  try {
    const pending = callCresium(
      { baseUrl: server.url.origin, credentials },
      { method: "GET", url: "/v3/health/" },
      controller.signal,
    );
    await received.promise;
    controller.abort();
    const error: unknown = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    await closed.promise;
  } finally {
    controller.abort();
    await server.stop(true);
  }
});

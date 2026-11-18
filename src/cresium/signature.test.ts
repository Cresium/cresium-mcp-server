import { describe, expect, it } from "bun:test";
import { createHash, createHmac } from "node:crypto";

import type { PartnerSession } from "../partner/types.ts";
import { SIGNATURE_MISTAKES } from "./mistakes.ts";
import { diagnoseSignature } from "./signature.ts";
import type { SignatureCheck } from "./types.ts";

const API_KEY = "0123456789abcdef0123456789abc017";
const SECRET = "test-secret-value";
const BASE_URL = "https://api.example.test";
const TIMESTAMP = "2026-04-21T15:42:03.000Z";
const NOW = new Date("2026-04-21T15:42:10.000Z");

function sessionWith(secret: string): PartnerSession {
  return {
    environment: "sandbox",
    apiBaseUrl: BASE_URL,
    credentials: { apiKey: API_KEY, secret, companyId: "44" },
  };
}

// Independent of src/: the way partner code signs, straight from node:crypto.
function hmac(
  text: string,
  key: string | Buffer = SECRET,
  encoding: "base64" | "hex" = "base64",
): string {
  return createHmac("sha256", key).update(text).digest(encoding);
}

const REQUEST_BODY = '{"toId":42,"amount":"100","currencyCode":"ARS"}';
const PREVIEW = "/v3/transaction/preview";
const SEARCH = "/v3/transaction/search?fromDate=2026-01-01";
const WEBHOOK_URL = "https://tuapp.com/webhooks/cresium?token=xyz";
const WEBHOOK_BODY = '{"type":"DEPOSIT","data":{"id":1}}';

const request = (
  fields: Partial<SignatureCheck> & { signature: string },
): SignatureCheck => ({
  kind: "request",
  timestamp: TIMESTAMP,
  method: "POST",
  url: PREVIEW,
  body: REQUEST_BODY,
  ...fields,
});

const webhook = (
  fields: Partial<SignatureCheck> & { signature: string },
): SignatureCheck => ({
  kind: "webhook",
  timestamp: TIMESTAMP,
  method: "POST",
  url: WEBHOOK_URL,
  body: WEBHOOK_BODY,
  ...fields,
});

interface MistakeCase {
  readonly id: string;
  readonly secret?: string;
  readonly check: SignatureCheck;
}

const BASE64_SECRET = Buffer.from("raw-secret-bytes-0123", "utf8").toString(
  "base64",
);
const HEX_SECRET = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const REQUEST_TEXT = `${TIMESTAMP}|POST|${PREVIEW}|${REQUEST_BODY}`;

const MISTAKE_CASES: readonly MistakeCase[] = [
  {
    id: "hex-digest",
    check: request({ signature: hmac(REQUEST_TEXT, SECRET, "hex") }),
  },
  {
    id: "base64url-digest",
    check: request({
      signature: hmac(REQUEST_TEXT)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", ""),
    }),
  },
  {
    id: "plain-sha256",
    check: request({
      signature: createHash("sha256").update(REQUEST_TEXT).digest("base64"),
    }),
  },
  {
    id: "lowercase-method",
    check: request({
      signature: hmac(`${TIMESTAMP}|post|${PREVIEW}|${REQUEST_BODY}`),
    }),
  },
  {
    id: "url-without-query",
    check: request({
      method: "GET",
      url: SEARCH,
      body: "",
      signature: hmac(`${TIMESTAMP}|GET|/v3/transaction/search|`),
    }),
  },
  {
    id: "full-url-instead-of-path",
    check: request({
      signature: hmac(
        `${TIMESTAMP}|POST|${BASE_URL}${PREVIEW}|${REQUEST_BODY}`,
      ),
    }),
  },
  {
    id: "path-instead-of-full-url",
    check: webhook({
      signature: hmac(
        `${TIMESTAMP}|POST|/webhooks/cresium?token=xyz|${WEBHOOK_BODY}`,
      ),
    }),
  },
  {
    id: "unencoded-brackets",
    check: request({
      method: "GET",
      url: "/v3/transaction/search?types%5B%5D=DEPOSIT",
      body: "",
      signature: hmac(
        `${TIMESTAMP}|GET|/v3/transaction/search?types[]=DEPOSIT|`,
      ),
    }),
  },
  {
    id: "body-pretty-printed",
    check: request({
      signature: hmac(
        `${TIMESTAMP}|POST|${PREVIEW}|${JSON.stringify({ toId: 42, amount: "100", currencyCode: "ARS" }, null, 2)}`,
      ),
    }),
  },
  {
    id: "body-keys-sorted",
    check: request({
      signature: hmac(
        `${TIMESTAMP}|POST|${PREVIEW}|{"amount":"100","currencyCode":"ARS","toId":42}`,
      ),
    }),
  },
  {
    id: "body-not-compacted",
    check: request({
      body: '{ "toId": 42, "amount": "100", "currencyCode": "ARS" }',
      signature: hmac(
        `${TIMESTAMP}|POST|${PREVIEW}|{ "toId": 42, "amount": "100", "currencyCode": "ARS" }`,
      ),
    }),
  },
  {
    id: "body-reserialized",
    check: webhook({
      body: '{"type": "DEPOSIT", "data": {"id": 1}}',
      signature: hmac(`${TIMESTAMP}|POST|${WEBHOOK_URL}|${WEBHOOK_BODY}`),
    }),
  },
  {
    id: "empty-body-as-braces",
    check: request({
      method: "GET",
      url: "/v3/balance/wallets",
      body: "",
      signature: hmac(`${TIMESTAMP}|GET|/v3/balance/wallets|{}`),
    }),
  },
  {
    id: "empty-body-as-null",
    check: request({
      method: "GET",
      url: "/v3/balance/wallets",
      body: "",
      signature: hmac(`${TIMESTAMP}|GET|/v3/balance/wallets|null`),
    }),
  },
  {
    id: "missing-final-pipe",
    check: request({
      method: "GET",
      url: "/v3/balance/wallets",
      body: "",
      signature: hmac(`${TIMESTAMP}|GET|/v3/balance/wallets`),
    }),
  },
  {
    id: "body-trailing-newline",
    check: request({ signature: hmac(`${REQUEST_TEXT}\n`) }),
  },
  {
    id: "secret-base64-decoded",
    secret: BASE64_SECRET,
    check: request({
      signature: hmac(REQUEST_TEXT, Buffer.from(BASE64_SECRET, "base64")),
    }),
  },
  {
    id: "secret-hex-decoded",
    secret: HEX_SECRET,
    check: request({
      signature: hmac(REQUEST_TEXT, Buffer.from(HEX_SECRET, "hex")),
    }),
  },
  {
    id: "api-key-as-secret",
    check: request({ signature: hmac(REQUEST_TEXT, API_KEY) }),
  },
];

describe("diagnoseSignature", () => {
  it("has one test case for every known mistake", () => {
    expect(MISTAKE_CASES.map(({ id }) => id).sort()).toEqual(
      SIGNATURE_MISTAKES.map(({ id }) => id).sort(),
    );
  });

  for (const { id, secret = SECRET, check } of MISTAKE_CASES) {
    it(`names ${id} when the client made that mistake`, () => {
      const result = diagnoseSignature(sessionWith(secret), check, NOW);
      expect(result).toMatchObject({ valid: false, cause: { id } });
    });
  }

  it("accepts a valid request signature", () => {
    const result = diagnoseSignature(
      sessionWith(SECRET),
      request({ signature: hmac(REQUEST_TEXT) }),
      NOW,
    );
    expect(result).toEqual({ valid: true, warnings: [] });
  });

  it("signs the compact body that mage re-serializes, not the one as sent", () => {
    const result = diagnoseSignature(
      sessionWith(SECRET),
      request({
        body: '{ "toId": 42, "amount": "100", "currencyCode": "ARS" }',
        signature: hmac(REQUEST_TEXT),
      }),
      NOW,
    );
    expect(result.valid).toBe(true);
  });

  it("accepts a valid webhook signature over the raw body and the registered URL", () => {
    const result = diagnoseSignature(
      sessionWith(SECRET),
      webhook({
        body: '{"type": "DEPOSIT", "data": {"id": 1}}',
        signature: hmac(
          `${TIMESTAMP}|POST|${WEBHOOK_URL}|{"type": "DEPOSIT", "data": {"id": 1}}`,
        ),
      }),
      NOW,
    );
    expect(result).toEqual({ valid: true, warnings: [] });
  });

  it("ignores the method for a webhook, which is always POST", () => {
    const result = diagnoseSignature(
      sessionWith(SECRET),
      webhook({
        method: "GET",
        signature: hmac(`${TIMESTAMP}|POST|${WEBHOOK_URL}|${WEBHOOK_BODY}`),
      }),
      NOW,
    );
    expect(result.valid).toBe(true);
  });

  it("lists what it checked and the structural problems when nothing matches", () => {
    const result = diagnoseSignature(
      sessionWith(SECRET),
      request({
        timestamp: "21/04/2026 15:42",
        url: "v3/transaction/preview",
        signature: "not-a-signature",
      }),
      NOW,
    );
    expect(result.valid).toBe(false);
    if (result.valid || "cause" in result) throw new Error("expected no match");
    expect(result.checked).toContain("hex-digest");
    expect(result.checked).toContain("lowercase-method");
    expect(result.checked).not.toContain("url-without-query");
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.join(" ")).toContain("ISO 8601");
    expect(result.warnings.join(" ")).toContain("empezar con /");
  });

  describe("timestamp window", () => {
    const signedAt = (seconds: number): string =>
      new Date(NOW.getTime() - seconds * 1000).toISOString();

    function warningsFor(check: SignatureCheck): readonly string[] {
      return diagnoseSignature(sessionWith(SECRET), check, NOW).warnings;
    }

    it("warns about a request older than 60 seconds, even when the signature is valid", () => {
      const timestamp = signedAt(61);
      const warnings = warningsFor(
        request({
          timestamp,
          signature: hmac(`${timestamp}|POST|${PREVIEW}|${REQUEST_BODY}`),
        }),
      );
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("60 segundos");
    });

    it("warns about a request timestamp ahead of the server clock", () => {
      expect(
        warningsFor(request({ timestamp: signedAt(-61), signature: "x" })),
      ).toHaveLength(1);
    });

    it("accepts a request within 60 seconds, and epoch milliseconds", () => {
      expect(
        warningsFor(request({ timestamp: signedAt(59), signature: "x" })),
      ).toEqual([]);
      expect(
        warningsFor(
          request({ timestamp: String(NOW.getTime() - 1000), signature: "x" }),
        ),
      ).toEqual([]);
    });

    it("gives a webhook 5 minutes, and asks for ISO 8601", () => {
      expect(
        warningsFor(webhook({ timestamp: signedAt(299), signature: "x" })),
      ).toEqual([]);
      const stale = warningsFor(
        webhook({ timestamp: signedAt(301), signature: "x" }),
      );
      expect(stale).toHaveLength(1);
      expect(stale[0]).toContain("5 minutos");
      const epoch = warningsFor(
        webhook({ timestamp: String(NOW.getTime()), signature: "x" }),
      );
      expect(epoch.join(" ")).toContain("ISO 8601");
    });
  });
});

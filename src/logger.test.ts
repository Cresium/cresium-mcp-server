import { describe, expect, it } from "bun:test";

import { captureLogger } from "../test/support/capture-logger.ts";

const API_KEY = "0123456789abcdef0123456789abc017";
const SECRET = "super-secret-value-that-must-never-be-logged";
const CREDENTIALS = { apiKey: API_KEY, secret: SECRET, companyId: "44" };
const HEADERS = {
  "x-api-key": API_KEY,
  "x-api-secret": SECRET,
  "x-company-id": "44",
};

function logged(entry: Record<string, unknown>): string {
  const { lines, logger } = captureLogger();
  logger.info(entry, "test");
  return lines.join("");
}

describe("createLogger", () => {
  it.each([
    ["the request headers", { headers: HEADERS }],
    ["a request", { req: { headers: HEADERS } }],
    [
      "an error that carries headers",
      { err: Object.assign(new Error("boom"), { headers: HEADERS }) },
    ],
    ["the credentials", { credentials: CREDENTIALS }],
    ["the partner session", { session: { credentials: CREDENTIALS } }],
    [
      "a context that holds the session",
      { ctx: { session: { credentials: CREDENTIALS } } },
    ],
    ["the API key on its own", { apiKey: API_KEY }],
  ])("hides the secret and the API key when code logs %s", (_label, entry) => {
    const output = logged(entry);
    expect(output).not.toContain(SECRET);
    expect(output).not.toContain(API_KEY);
  });

  it("keeps the masked API key and the company id that every tool call logs", () => {
    const output = logged({
      apiKeyMasked: "****c017",
      companyId: "44",
    });
    expect(JSON.parse(output)).toMatchObject({
      apiKeyMasked: "****c017",
      companyId: "44",
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";

import type { Client } from "@modelcontextprotocol/client";

import { callTool } from "./support/call-tool.ts";
import { startApp } from "./support/start-app.ts";
import type { RunningApp } from "./support/types.ts";

const API_KEY = "0123456789abcdef0123456789abc017";
const SECRET = "diagnose-secret-that-must-never-come-back";
const HEADERS = {
  "x-api-key": API_KEY,
  "x-api-secret": SECRET,
  "x-company-id": "44",
};
const DEAD_UPSTREAM = "http://127.0.0.1:9";

let app: RunningApp;
let client: Client;

beforeAll(async () => {
  app = await startApp({
    sandbox: DEAD_UPSTREAM,
    production: DEAD_UPSTREAM,
    docs: DEAD_UPSTREAM,
  });
  client = await app.connect("sandbox", HEADERS);
});

afterAll(async () => {
  await client.close();
  app.stop();
});

function signedNow(secret: string) {
  const timestamp = new Date().toISOString();
  const url = "/v3/transaction/search?fromDate=2026-01-01";
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}|GET|${url}|`)
    .digest("base64");
  return { timestamp, url, expected };
}

describe("diagnose_signature through the MCP protocol", () => {
  it("is a read-only tool that needs no Cresium call", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find(({ name }) => name === "diagnose_signature");
    expect(tool?.annotations?.readOnlyHint).toBe(true);
  });

  it("says a correct signature is valid without any upstream reachable", async () => {
    const { timestamp, url, expected } = signedNow(SECRET);
    const result = await callTool(client, "diagnose_signature", {
      kind: "request",
      timestamp,
      method: "GET",
      url,
      body: "",
      signature: expected,
    });
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toEqual({ valid: true, warnings: [] });
  });

  it("names the mistake, and never returns the secret, the API key or the expected signature", async () => {
    const { timestamp, url, expected } = signedNow(SECRET);
    const hexSignature = createHmac("sha256", SECRET)
      .update(`${timestamp}|GET|${url}|`)
      .digest("hex");
    const wrong = await callTool(client, "diagnose_signature", {
      kind: "request",
      timestamp,
      method: "GET",
      url,
      body: "",
      signature: hexSignature,
    });
    const nothing = await callTool(client, "diagnose_signature", {
      kind: "request",
      timestamp,
      method: "GET",
      url,
      body: "",
      signature: "AAAA",
    });
    expect(JSON.parse(wrong.text)).toMatchObject({
      valid: false,
      cause: { id: "hex-digest" },
    });
    for (const text of [wrong.text, nothing.text, app.logLines.join("\n")]) {
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(API_KEY);
      expect(text).not.toContain(expected);
    }
  });

  it("asks for the method when the kind is request", async () => {
    const result = await callTool(client, "diagnose_signature", {
      kind: "request",
      timestamp: new Date().toISOString(),
      url: "/v3/balance/wallets",
      body: "",
      signature: "AAAA",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("method");
  });

  it("rejects an input that is not valid", async () => {
    const result = await callTool(client, "diagnose_signature", {
      kind: "nope",
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("kind");
  });
});

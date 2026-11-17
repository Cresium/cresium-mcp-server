import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { startApp } from "../../test/support/start-app.ts";
import type { RunningApp } from "../../test/support/types.ts";

const API_KEY = "0123456789abcdef0123456789abc017";
const SECRET = "super-secret-value-that-must-never-be-logged";
const HEADERS = {
  "x-api-key": API_KEY,
  "x-api-secret": SECRET,
  "x-company-id": "44",
};

let app: RunningApp;

beforeAll(async () => {
  app = await startApp({
    sandbox: "http://localhost:9",
    production: "http://localhost:9",
  });
});

afterAll(() => {
  app.stop();
});

describe("HTTP", () => {
  it("[GET] /health - 200", async () => {
    const response = await fetch(`${app.url}/health`);
    expect(response.status).toBe(200);
  });

  it("[POST] /sandbox - 401 - names the missing headers", async () => {
    const response = await fetch(`${app.url}/sandbox`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY },
      body: "{}",
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { message: string };
    expect(body.message).toContain("x-api-secret");
    expect(body.message).toContain("x-company-id");
  });

  it("[GET] /health - 200 - for a probe that sends the pod IP as Host", async () => {
    const response = await fetch(`${app.url}/health`, {
      headers: { host: "10.1.2.3:3000" },
    });
    expect(response.status).toBe(200);
  });

  it("[POST] /sandbox - 403 - for a Host that is not the public one", async () => {
    const response = await fetch(`${app.url}/sandbox`, {
      method: "POST",
      headers: { ...HEADERS, host: "evil.example" },
    });
    expect(response.status).toBe(403);
  });

  it("[POST] /sandbox - 401 - for a company id that is not a number", async () => {
    const response = await fetch(`${app.url}/sandbox`, {
      method: "POST",
      headers: { ...HEADERS, "x-company-id": "44 OR 1=1" },
    });
    expect(response.status).toBe(401);
  });

  it("[POST] /staging - 404 - only sandbox and production exist", async () => {
    const response = await fetch(`${app.url}/staging`, { method: "POST" });
    expect(response.status).toBe(404);
  });
});

describe("MCP", () => {
  it("serves an MCP server with no tools yet", async () => {
    const client = await app.connect("sandbox", HEADERS);
    const { tools } = await client.listTools();
    expect(tools).toEqual([]);
    await client.close();
  });
});

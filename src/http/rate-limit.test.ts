import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

import { startFakeCresium } from "../../test/support/fake-cresium.ts";
import { startApp } from "../../test/support/start-app.ts";
import type { RunningApp } from "../../test/support/types.ts";

const SECRET = "super-secret-value-that-must-never-be-logged";
const HEADERS = {
  "x-api-key": "0123456789abcdef0123456789abc017",
  "x-api-secret": SECRET,
  "x-company-id": "44",
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
  "mcp-protocol-version": "2025-06-18",
};
const LIMIT = 3;
const TOOLS_LIST = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list",
});
const READ_WALLETS = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/call",
  params: {
    name: "read_api",
    arguments: { operation: "GET /v3/balance/wallets" },
  },
});
const MCP_PATHS = [
  "/sandbox",
  "/production",
  "/sandbox/read-only",
  "/production/read-only",
];
const SECONDS_PER_MINUTE = 60;

const upstream = startFakeCresium(SECRET);
const apps: RunningApp[] = [];

async function appWith(env: Record<string, string>): Promise<RunningApp> {
  const app = await startApp(
    {
      sandbox: upstream.baseUrl,
      production: upstream.baseUrl,
      docs: "http://localhost:9",
    },
    { RATE_LIMIT_PER_MINUTE: String(LIMIT), ...env },
  );
  apps.push(app);
  return app;
}

function post(
  app: RunningApp,
  path: string,
  options: { body?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  return fetch(`${app.url}${path}`, {
    method: "POST",
    headers: { ...HEADERS, ...options.headers },
    body: options.body ?? TOOLS_LIST,
  });
}

async function statuses(
  count: number,
  send: () => Promise<Response>,
): Promise<number[]> {
  const result: number[] = [];
  for (let i = 0; i < count; i += 1) result.push((await send()).status);
  return result;
}

afterEach(() => {
  setSystemTime();
  upstream.received.length = 0;
  for (const app of apps.splice(0)) app.stop();
});

describe("per-IP rate limit", () => {
  it("lets requests under the limit through", async () => {
    const app = await appWith({});
    expect(await statuses(LIMIT, () => post(app, "/sandbox"))).toEqual([
      200, 200, 200,
    ]);
  });

  it("answers 429 over the limit, with Retry-After and the error shape of the other refusals", async () => {
    const app = await appWith({});
    await statuses(LIMIT, () => post(app, "/production"));
    const response = await post(app, "/production");
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(Number(response.headers.get("retry-after"))).toBeLessThanOrEqual(
      SECONDS_PER_MINUTE,
    );
    expect(response.headers.get("ratelimit")).toContain("remaining=0");
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("rate_limited");
    expect(body.message).toContain("Demasiados pedidos");
  });

  it("refuses before reading credentials and before any upstream call", async () => {
    const app = await appWith({});
    const withoutCredentials = (): Promise<Response> =>
      fetch(`${app.url}/sandbox`, { method: "POST", body: "{}" });
    expect(await statuses(LIMIT, withoutCredentials)).toEqual([401, 401, 401]);
    expect((await withoutCredentials()).status).toBe(429);

    expect((await post(app, "/sandbox", { body: READ_WALLETS })).status).toBe(
      429,
    );
    expect(upstream.received).toHaveLength(0);
  });

  it("shares one budget across every MCP route", async () => {
    const app = await appWith({
      RATE_LIMIT_PER_MINUTE: String(MCP_PATHS.length),
    });
    for (const path of MCP_PATHS) {
      expect((await post(app, path)).status).toBe(200);
    }
    for (const path of MCP_PATHS) {
      expect((await post(app, path)).status).toBe(429);
    }
  });

  it("never limits /health", async () => {
    const app = await appWith({});
    await statuses(LIMIT + 1, () => post(app, "/sandbox"));
    const health = await statuses(LIMIT * 5, () => fetch(`${app.url}/health`));
    expect(new Set(health)).toEqual(new Set([200]));
  });

  it("starts a new window after a minute", async () => {
    const app = await appWith({});
    await statuses(LIMIT, () => post(app, "/sandbox"));
    expect((await post(app, "/sandbox")).status).toBe(429);

    setSystemTime(new Date(Date.now() + (SECONDS_PER_MINUTE + 1) * 1000));
    expect((await post(app, "/sandbox")).status).toBe(200);
  });

  describe("behind one trusted proxy", () => {
    it("gives each client IP its own budget", async () => {
      const app = await appWith({ TRUSTED_PROXY_HOPS: "1" });
      const from = (ip: string) => (): Promise<Response> =>
        post(app, "/sandbox", { headers: { "x-forwarded-for": ip } });
      await statuses(LIMIT, from("203.0.113.1"));
      expect((await from("203.0.113.1")()).status).toBe(429);
      expect((await from("203.0.113.2")()).status).toBe(200);
    });

    it("keys on what the proxy appended, so a caller cannot dodge by prefixing addresses", async () => {
      const app = await appWith({ TRUSTED_PROXY_HOPS: "1" });
      const spoofed = (n: number) => (): Promise<Response> =>
        post(app, "/sandbox", {
          headers: { "x-forwarded-for": `198.51.100.${n}, 203.0.113.1` },
        });
      expect(await statuses(LIMIT, () => spoofed(1)())).toEqual([
        200, 200, 200,
      ]);
      expect((await spoofed(2)()).status).toBe(429);
    });
  });

  it("with 0 trusted hops a spoofed X-Forwarded-For does not make a new budget", async () => {
    const app = await appWith({ TRUSTED_PROXY_HOPS: "0" });
    const spoofed = (n: number): Promise<Response> =>
      post(app, "/sandbox", {
        headers: { "x-forwarded-for": `203.0.113.${n}` },
      });
    expect(
      await Promise.all([1, 2, 3].map((n) => spoofed(n))).then((all) =>
        all.map(({ status }) => status),
      ),
    ).toEqual([200, 200, 200]);
    expect((await spoofed(4)).status).toBe(429);
  });
});

import { describe, expect, it } from "bun:test";

import { loadConfig } from "./config.ts";

const VALID = {
  MCP_BASE_URL: "https://mcp.cresium.app/",
  CRESIUM_SANDBOX_API_URL: "https://api.develop.cresium.app",
  CRESIUM_PRODUCTION_API_URL: "https://api.cresium.app/",
  CRESIUM_DOCS_URL: "https://docs.cresium.com",
};

describe("loadConfig", () => {
  it("maps each environment to its API and trims trailing slashes", () => {
    const config = loadConfig(VALID);
    expect(config.baseUrl).toBe("https://mcp.cresium.app");
    expect(config.apiUrls).toEqual({
      sandbox: "https://api.develop.cresium.app",
      production: "https://api.cresium.app",
    });
  });

  it("requires every Cresium URL instead of defaulting it", () => {
    const { CRESIUM_PRODUCTION_API_URL: _omitted, ...rest } = VALID;
    expect(() => loadConfig(rest)).toThrow(/CRESIUM_PRODUCTION_API_URL/);
  });

  it("limits each IP to 300 requests a minute and trusts no proxy unless told", () => {
    const config = loadConfig(VALID);
    expect(config.rateLimitPerMinute).toBe(300);
    expect(config.trustedProxyHops).toBe(0);
  });

  it("reads the limit and the proxy hops", () => {
    const config = loadConfig({
      ...VALID,
      RATE_LIMIT_PER_MINUTE: "60",
      TRUSTED_PROXY_HOPS: "1",
    });
    expect(config.rateLimitPerMinute).toBe(60);
    expect(config.trustedProxyHops).toBe(1);
  });

  it("warns once in production when no proxy hop is trusted, since every caller then shares one limit", () => {
    const { warnings } = loadConfig({ ...VALID, NODE_ENV: "production" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("TRUSTED_PROXY_HOPS");
    expect(warnings[0]).toContain("one rate limit");
  });

  it.each([
    [
      "production with the hops set",
      { NODE_ENV: "production", TRUSTED_PROXY_HOPS: "1" },
    ],
    ["outside production", { NODE_ENV: "development" }],
    ["without NODE_ENV", {}],
  ])("does not warn about the proxy hops %s", (_case, env) => {
    expect(loadConfig({ ...VALID, ...env }).warnings).toEqual([]);
  });

  it.each([
    ["RATE_LIMIT_PER_MINUTE", "0"],
    ["RATE_LIMIT_PER_MINUTE", "1.5"],
    ["TRUSTED_PROXY_HOPS", "-1"],
    ["TRUSTED_PROXY_HOPS", "true"],
  ])("refuses %s=%s", (name, value) => {
    expect(() => loadConfig({ ...VALID, [name]: value })).toThrow(
      new RegExp(name),
    );
  });

  it("refuses plain http outside localhost, so credentials never travel unencrypted", () => {
    expect(() =>
      loadConfig({
        ...VALID,
        CRESIUM_SANDBOX_API_URL: "http://api.develop.cresium.app",
      }),
    ).toThrow(/https/);
  });
});

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

  it("refuses plain http outside localhost, so credentials never travel unencrypted", () => {
    expect(() =>
      loadConfig({
        ...VALID,
        CRESIUM_SANDBOX_API_URL: "http://api.develop.cresium.app",
      }),
    ).toThrow(/https/);
  });
});

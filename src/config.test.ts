import { describe, expect, it } from "bun:test";

import { loadConfig } from "./config.ts";

describe("loadConfig", () => {
  it("trims the trailing slash of the public URL", () => {
    expect(
      loadConfig({ MCP_BASE_URL: "https://mcp.cresium.app/" }).baseUrl,
    ).toBe("https://mcp.cresium.app");
  });

  it("requires the public URL instead of defaulting it", () => {
    expect(() => loadConfig({})).toThrow(/MCP_BASE_URL/);
  });

  it("refuses plain http outside localhost, so credentials never travel unencrypted", () => {
    expect(() =>
      loadConfig({ MCP_BASE_URL: "http://mcp.cresium.app" }),
    ).toThrow(/https/);
  });
});

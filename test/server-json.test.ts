import { describe, expect, it } from "bun:test";
import * as z from "zod";

import { SERVER_INFO } from "../src/constants.ts";
import { CREDENTIAL_HEADERS, ENVIRONMENTS } from "../src/partner/constants.ts";

const MCP_HOST = "https://mcp.cresium.app";

const headerSchema = z.object({
  name: z.string(),
  isRequired: z.boolean(),
  isSecret: z.boolean(),
});

const serverJsonSchema = z.object({
  name: z.string(),
  title: z.string(),
  version: z.string(),
  websiteUrl: z.string(),
  remotes: z.array(
    z.object({
      type: z.string(),
      url: z.string(),
      headers: z.array(headerSchema),
    }),
  ),
});

const serverJson = serverJsonSchema.parse(
  await Bun.file(new URL("../server.json", import.meta.url)).json(),
);
const readme = await Bun.file(new URL("../README.md", import.meta.url)).text();

describe("server.json", () => {
  it("identifies the server like the code does", () => {
    expect(serverJson.title).toBe(SERVER_INFO.title);
    expect(serverJson.version).toBe(SERVER_INFO.version);
    expect(serverJson.websiteUrl).toBe(SERVER_INFO.websiteUrl);
  });

  it("has one streamable-http remote per environment, at the URL the README gives", () => {
    expect(serverJson.remotes.map(({ url }) => url)).toEqual(
      ENVIRONMENTS.map((environment) => `${MCP_HOST}/${environment}`),
    );
    for (const { type, url } of serverJson.remotes) {
      expect(type).toBe("streamable-http");
      expect(readme).toContain(`\`${url}\``);
    }
  });

  it("declares the three credential headers as required, secret except the company id", () => {
    const expected = [
      { name: CREDENTIAL_HEADERS.apiKey, isRequired: true, isSecret: true },
      { name: CREDENTIAL_HEADERS.secret, isRequired: true, isSecret: true },
      { name: CREDENTIAL_HEADERS.companyId, isRequired: true, isSecret: false },
    ];
    for (const { headers } of serverJson.remotes) {
      expect(headers).toEqual(expected);
    }
  });
});

describe("README install links", () => {
  const PLACEHOLDERS = ["YOUR_API_KEY", "YOUR_SECRET", "YOUR_COMPANY_ID"];

  function headersOf(config: unknown): unknown {
    return z.object({ headers: z.unknown() }).parse(config).headers;
  }

  it("carry only header placeholders, never real values", () => {
    const cursor = /cursor:\/\/[^\s)]*config=([^\s)]+)/.exec(readme)?.[1];
    const vscode = /vscode:mcp\/install\?([^\s)]+)/.exec(readme)?.[1];
    expect(cursor).toBeDefined();
    expect(vscode).toBeDefined();
    const configs = [
      JSON.parse(
        Buffer.from(decodeURIComponent(cursor ?? ""), "base64").toString(),
      ),
      JSON.parse(decodeURIComponent(vscode ?? "")),
    ];
    for (const config of configs) {
      expect(
        Object.keys(z.record(z.string(), z.string()).parse(headersOf(config))),
      ).toEqual(Object.values(CREDENTIAL_HEADERS));
      expect(
        Object.values(
          z.record(z.string(), z.string()).parse(headersOf(config)),
        ),
      ).toEqual(PLACEHOLDERS);
    }
  });
});

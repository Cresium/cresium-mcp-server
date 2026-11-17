import { afterAll, describe, expect, it } from "bun:test";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { ToolError } from "../tools/errors.ts";
import { MINTLIFY_TOOLS } from "./constants.ts";
import { callMintlify, fetchDocPage } from "./mintlify.ts";

const requested: string[] = [];
const fakeMintlify = createMcpHandler(() => {
  const server = new McpServer({ name: "fake-mintlify", version: "0" });
  server.registerTool(
    MINTLIFY_TOOLS.search,
    { inputSchema: z.object({ query: z.string() }) },
    ({ query }) => ({
      isError: query === "boom",
      content: [{ type: "text", text: `resultados para ${query}` }],
    }),
  );
  return server;
});
const docs = Bun.serve({
  port: 0,
  fetch: (request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/mcp") return fakeMintlify.fetch(request);
    requested.push(pathname);
    return pathname === "/sandbox.md"
      ? new Response("# Sandbox")
      : new Response("not found", { status: 404 });
  },
});
const docsUrl = `http://localhost:${docs.port}`;
const signal = new AbortController().signal;

afterAll(() => docs.stop(true));

describe("callMintlify", () => {
  it("returns the tool's text", async () => {
    const text = await callMintlify(
      docsUrl,
      { tool: MINTLIFY_TOOLS.search, args: { query: "webhook" } },
      signal,
    );
    expect(text).toBe("resultados para webhook");
  });

  it("turns a Mintlify tool error into a ToolError", async () => {
    const error: unknown = await callMintlify(
      docsUrl,
      { tool: MINTLIFY_TOOLS.search, args: { query: "boom" } },
      signal,
    ).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(ToolError);
  });
});

describe("fetchDocPage", () => {
  it.each([
    "sandbox",
    "/sandbox",
    "sandbox.mdx",
    "https://docs.cresium.com/sandbox",
  ])("reads %s as /sandbox.md", async (path) => {
    expect(await fetchDocPage(docsUrl, path, signal)).toBe("# Sandbox");
  });

  it("throws a ToolError that points to search_docs for a missing page", async () => {
    const error: unknown = await fetchDocPage(docsUrl, "nope", signal).catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(ToolError);
    expect(String(error)).toContain("search_docs");
  });
});

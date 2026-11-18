import { afterAll, describe, expect, it } from "bun:test";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { ToolError } from "../tools/errors.ts";
import { MINTLIFY_TOOLS } from "./constants.ts";
import { callMintlify, fetchDocPage } from "./mintlify.ts";

const requested: string[] = [];
let otherHostHits = 0;
const otherHost = Bun.serve({
  port: 0,
  fetch: () => {
    otherHostHits += 1;
    return new Response("internal only");
  },
});
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
    if (pathname === "/moved.md") {
      return Response.redirect(`${otherHost.url.origin}/internal`, 302);
    }
    return pathname === "/sandbox.md"
      ? new Response("# Sandbox")
      : new Response("not found", { status: 404 });
  },
});
const docsUrl = `http://localhost:${docs.port}`;
const signal = new AbortController().signal;

afterAll(async () => {
  await docs.stop(true);
  await otherHost.stop(true);
});

describe("callMintlify", () => {
  it("returns the tool's text blocks", async () => {
    const blocks = await callMintlify(
      docsUrl,
      { tool: MINTLIFY_TOOLS.search, args: { query: "webhook" } },
      signal,
    );
    expect(blocks).toEqual(["resultados para webhook"]);
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

  it("does not follow a redirect to another host", async () => {
    const error: unknown = await fetchDocPage(docsUrl, "moved", signal).catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(ToolError);
    expect(otherHostHits).toBe(0);
  });
});

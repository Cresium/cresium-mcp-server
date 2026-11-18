import { afterAll, describe, expect, it } from "bun:test";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod";

import { startEndlessUpstream } from "../../test/support/endless-upstream.ts";
import { startGzipUpstream } from "../../test/support/gzip-upstream.ts";
import { bytesHandedToReaders } from "../../test/support/reader-bytes.ts";
import { MAX_UPSTREAM_BODY_BYTES } from "../constants.ts";
import { UserFacingError } from "../errors.ts";
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

  it("turns a Mintlify tool error into a UserFacingError", async () => {
    const error: unknown = await callMintlify(
      docsUrl,
      { tool: MINTLIFY_TOOLS.search, args: { query: "boom" } },
      signal,
    ).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(UserFacingError);
  });
});

describe("fetchDocPage", () => {
  it.each([
    "sandbox",
    "/sandbox",
    "sandbox.mdx",
    "sandbox.md",
    "https://docs.cresium.com/sandbox.mdx",
    "https://docs.cresium.com/sandbox.md",
    "https://docs.cresium.com/sandbox",
  ])("reads %s as /sandbox.md", async (path) => {
    expect(await fetchDocPage(docsUrl, path, signal)).toBe("# Sandbox");
    expect(requested.at(-1)).toBe("/sandbox.md");
  });

  it("throws a UserFacingError that points to search_docs for a missing page", async () => {
    const error: unknown = await fetchDocPage(docsUrl, "nope", signal).catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(UserFacingError);
    expect(String(error)).toContain("search_docs");
  });

  it("does not follow a redirect to another host", async () => {
    const error: unknown = await fetchDocPage(docsUrl, "moved", signal).catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(UserFacingError);
    expect(otherHostHits).toBe(0);
  });
});

describe("fetchDocPage with a page that never ends", () => {
  it("stops reading past the limit, hangs up and says so", async () => {
    const endless = startEndlessUpstream();
    const error: unknown = await fetchDocPage(
      endless.baseUrl,
      "sandbox",
      signal,
    ).catch((thrown: unknown) => thrown);
    if (!(error instanceof UserFacingError)) throw new Error("did not fail");
    expect(error.message).toContain("2 MiB");
    for (let wait = 0; wait < 100 && !endless.state.cancelled; wait += 1) {
      await Bun.sleep(10);
    }
    expect(endless.state.cancelled).toBe(true);
    expect(endless.state.sentBytes).toBeLessThan(MAX_UPSTREAM_BODY_BYTES * 3);
    await endless.stop();
  });
});

describe("fetchDocPage with a compressed page", () => {
  it("asks for an uncompressed page, so a gzip body never inflates in memory", async () => {
    const honoring = startGzipUpstream({ honorsAcceptEncoding: true });
    let page = "";
    const handed = await bytesHandedToReaders(async () => {
      page = await fetchDocPage(honoring.baseUrl, "sandbox", signal);
    });
    await honoring.stop();
    expect(honoring.acceptEncodings).toEqual(["identity"]);
    expect(page).toBe(honoring.smallAnswer);
    expect(handed).toBe(honoring.smallAnswer.length);
  });

  it("refuses a page compressed anyway without inflating it", async () => {
    const ignoring = startGzipUpstream({ honorsAcceptEncoding: false });
    let error: unknown;
    const handed = await bytesHandedToReaders(async () => {
      error = await fetchDocPage(ignoring.baseUrl, "sandbox", signal).catch(
        (thrown: unknown) => thrown,
      );
    });
    await ignoring.stop();
    expect(handed).toBeLessThanOrEqual(ignoring.compressedBytes);
    expect(error).toBeInstanceOf(UserFacingError);
    if (!(error instanceof UserFacingError)) return;
    expect(error.message).toContain("comprimid");
  });
});

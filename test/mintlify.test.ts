// Contract check against the live docs MCP: fails if Mintlify renames the tools search_docs and send_docs_feedback call.
// Opt-in (`bun run test:docs`) so PR checks do not depend on docs.cresium.com; .github/workflows/docs-contract.yml runs it every weekday.
import { describe, expect, it } from "bun:test";

import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

import { MINTLIFY_TOOLS } from "../src/docs/constants.ts";

const DOCS_MCP_URL = "https://docs.cresium.com/mcp";

describe.if(process.env["DOCS_IT"] === "1")("Mintlify docs MCP", () => {
  it("still exposes the tools this server calls", async () => {
    const client = new Client({ name: "contract-test", version: "0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(DOCS_MCP_URL)),
    );
    const { tools } = await client.listTools();
    await client.close();
    const names = tools.map((tool) => tool.name);
    for (const expected of Object.values(MINTLIFY_TOOLS)) {
      expect(names).toContain(expected);
    }
  });
});

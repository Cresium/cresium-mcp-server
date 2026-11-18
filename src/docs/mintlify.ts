import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

import { SERVER_INFO } from "../constants.ts";
import { ToolError } from "../tools/errors.ts";
import { BLOCK_SEPARATOR } from "./constants.ts";
import type { MintlifyCall } from "./types.ts";

function textBlocksOf(
  content: readonly { type: string; text?: string }[],
): readonly string[] {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "");
}

/** Calls one tool on the docs site's Mintlify MCP server and returns its text blocks. */
export async function callMintlify(
  docsUrl: string,
  { tool, args }: MintlifyCall,
  signal: AbortSignal,
): Promise<readonly string[]> {
  const client = new Client(SERVER_INFO);
  const transport = new StreamableHTTPClientTransport(
    new URL(`${docsUrl}/mcp`),
  );
  try {
    await client.connect(transport, { signal });
    const result = await client.callTool(
      { name: tool, arguments: args },
      { signal },
    );
    const blocks = textBlocksOf(result.content);
    if (result.isError === true) {
      throw new ToolError(
        `La docu respondió con un error: ${blocks.join(BLOCK_SEPARATOR)}`,
      );
    }
    return blocks;
  } finally {
    await client.close();
  }
}

/** Fetches a docs page as Markdown (Mintlify serves `<page>.md`). */
export async function fetchDocPage(
  docsUrl: string,
  path: string,
  signal: AbortSignal,
): Promise<string> {
  const normalized = path
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/^\/+/, "")
    .replace(/\.mdx?$/, "");
  // A redirect is not followed: it could point this server at a host other than the docs site.
  const response = await fetch(`${docsUrl}/${normalized}.md`, {
    signal,
    redirect: "manual",
  });
  if (!response.ok) {
    throw new ToolError(
      `No encontré la página "${path}" (${response.status}). Usá search_docs para encontrar el path correcto.`,
    );
  }
  return await response.text();
}

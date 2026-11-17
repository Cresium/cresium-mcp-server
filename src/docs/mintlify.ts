import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

import { SERVER_INFO } from "../constants.ts";
import { ToolError } from "../tools/errors.ts";
import type { MintlifyCall } from "./types.ts";

function textOf(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n\n");
}

/** Calls one tool on the docs site's Mintlify MCP server and returns its text. */
export async function callMintlify(
  docsUrl: string,
  { tool, args }: MintlifyCall,
  signal: AbortSignal,
): Promise<string> {
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
    const text = textOf(result.content);
    if (result.isError === true) {
      throw new ToolError(`La docu respondió con un error: ${text}`);
    }
    return text;
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
  const response = await fetch(`${docsUrl}/${normalized}.md`, { signal });
  if (!response.ok) {
    throw new ToolError(
      `No encontré la página "${path}" (${response.status}). Usá search_docs para encontrar el path correcto.`,
    );
  }
  return await response.text();
}

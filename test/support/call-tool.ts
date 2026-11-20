import type { Client } from "@modelcontextprotocol/client";

import type { ToolText } from "./types.ts";

export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolText> {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  return { isError: result.isError === true, text };
}

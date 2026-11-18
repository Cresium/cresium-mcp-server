import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import { SERVER_INFO, UNAUTHORIZED_STATUS } from "../constants.ts";
import { maskApiKey, readCredentials } from "../partner/credentials.ts";
import { connectedTo } from "../partner/environment.ts";
import type { PartnerSession } from "../partner/types.ts";
import { runTool } from "../tools/run.ts";
import type { ToolDef } from "../tools/types.ts";
import { PROMPTS, SERVER_INSTRUCTIONS } from "./constants.ts";
import type { McpEndpointOptions } from "./types.ts";

// A write tool names the environment in its own description, because agents read it right before calling.
function describeTool(tool: ToolDef, environmentLine: string): string {
  return tool.access === "write"
    ? `${tool.description} ${environmentLine}`
    : tool.description;
}

function registerPrompts(server: McpServer): void {
  for (const { name, title, description, text } of PROMPTS) {
    server.registerPrompt(name, { title, description }, () => ({
      messages: [{ role: "user", content: { type: "text", text } }],
    }));
  }
}

function buildMcpServer(
  options: McpEndpointOptions,
  session: PartnerSession,
): McpServer {
  const environmentLine = connectedTo(session.environment);
  const server = new McpServer(SERVER_INFO, {
    capabilities: {
      tools: { listChanged: false },
      prompts: { listChanged: false },
    },
    instructions: `Servidor MCP de Cresium: API V3 de partners y documentación. ${environmentLine}\n${SERVER_INSTRUCTIONS}`,
  });
  registerPrompts(server);
  const logger = options.logger.child({
    environment: session.environment,
    companyId: session.credentials.companyId,
    apiKeyMasked: maskApiKey(session.credentials.apiKey),
  });
  for (const tool of options.tools) {
    server.registerTool(
      tool.name,
      {
        description: describeTool(tool, environmentLine),
        inputSchema: tool.input,
        annotations: {
          readOnlyHint: tool.access === "read",
          openWorldHint: true,
        },
      },
      (input, ctx) =>
        runTool(
          {
            tool,
            input,
            context: { session, logger, signal: ctx.mcpReq.signal },
          },
          {
            timeoutMs: options.timeoutMs,
            ensureConnected: options.ensureConnected,
          },
        ),
    );
  }
  return server;
}

export function createMcpEndpoint(
  options: McpEndpointOptions,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const result = readCredentials(request.headers);
    if (!result.ok) {
      return Response.json(
        {
          error: "missing_credentials",
          message: `Credenciales inválidas: ${result.problems.join("; ")}.`,
        },
        { status: UNAUTHORIZED_STATUS },
      );
    }
    const session: PartnerSession = {
      environment: options.environment,
      apiBaseUrl: options.apiBaseUrl,
      credentials: result.credentials,
    };
    // One handler per request, so the server factory closes over this request's credentials.
    const handler = createMcpHandler(() => buildMcpServer(options, session), {
      onerror: (error) => {
        options.logger.error({ err: error }, "mcp handler error");
      },
    });
    return await handler.fetch(request);
  };
}

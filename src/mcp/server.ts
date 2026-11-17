import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";

import { SERVER_INFO, UNAUTHORIZED_STATUS } from "../constants.ts";
import { maskApiKey, readCredentials } from "../partner/credentials.ts";
import type { PartnerCredentials, PartnerSession } from "../partner/types.ts";
import { runTool } from "../tools/run.ts";
import type { McpEndpointOptions } from "./types.ts";

// The SDK builds the server from the same Request that `fetch` below already checked, so a miss is a wiring bug.
function credentialsOf(request: Request | undefined): PartnerCredentials {
  const result = readCredentials(request?.headers ?? new Headers());
  if (!result.ok) {
    throw new Error(
      "MCP request reached the server without partner credentials",
    );
  }
  return result.credentials;
}

function buildMcpServer(
  options: McpEndpointOptions,
  session: PartnerSession,
): McpServer {
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: { listChanged: false } },
  });
  const logger = options.logger.child({
    environment: session.environment,
    companyId: session.credentials.companyId,
    apiKey: maskApiKey(session.credentials.apiKey),
  });
  for (const tool of options.tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
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
          options.timeoutMs,
        ),
    );
  }
  return server;
}

/** One MCP endpoint bound to one Cresium environment: 401 without credentials, else a fresh MCP server per request. */
export function createMcpEndpoint(
  options: McpEndpointOptions,
): (request: Request) => Promise<Response> {
  const handler = createMcpHandler(
    ({ requestInfo }) =>
      buildMcpServer(options, {
        environment: options.environment,
        apiBaseUrl: options.apiBaseUrl,
        credentials: credentialsOf(requestInfo),
      }),
    {
      onerror: (error) => {
        options.logger.error({ err: error }, "mcp handler error");
      },
    },
  );
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
    return await handler.fetch(request);
  };
}

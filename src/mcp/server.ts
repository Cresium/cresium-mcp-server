import {
  createMcpHandler,
  DEFAULT_MAX_REQUEST_BODY_SIZE,
  McpServer,
  readRequestBody,
} from "@modelcontextprotocol/server";

import {
  BAD_REQUEST_STATUS,
  SERVER_INFO,
  UNAUTHORIZED_STATUS,
} from "../constants.ts";
import { maskApiKey, readCredentials } from "../partner/credentials.ts";
import { connectedTo } from "../partner/environment.ts";
import type { PartnerSession } from "../partner/types.ts";
import { runTool } from "../tools/run.ts";
import type { ToolDef } from "../tools/types.ts";
import {
  BATCH_REFUSED_MESSAGE,
  PROMPTS,
  SERVER_INSTRUCTIONS,
} from "./constants.ts";
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

// The SDK's 2025-era fallback runs every message of a batch at once, so one POST could fan out into
// 100 signed calls, and two identical ones collide on mage's "Signature already used". The SDK has no
// option to refuse batches, so this reads a clone under the SDK's own size limit; anything it cannot
// read or parse is left for the SDK to answer.
async function isBatch(request: Request): Promise<boolean> {
  if (request.method.toUpperCase() !== "POST") return false;
  try {
    // Bun types `clone()` as undici's Request, which the SDK's helper does not take, so only its body is reused.
    const probe = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.clone().body,
    });
    const read = await readRequestBody(probe, DEFAULT_MAX_REQUEST_BODY_SIZE);
    if (read.tooLarge) return false;
    const body: unknown = JSON.parse(read.text);
    return Array.isArray(body);
  } catch {
    return false;
  }
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
    if (await isBatch(request)) {
      return Response.json(
        { error: "batch_not_supported", message: BATCH_REFUSED_MESSAGE },
        { status: BAD_REQUEST_STATUS },
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

import type { ToolAnnotations } from "@modelcontextprotocol/server";
import {
  createMcpHandler,
  DEFAULT_MAX_REQUEST_BODY_SIZE,
  isJsonContentType,
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
import type { AccessMode, ToolDef } from "../tools/types.ts";
import {
  ACCESS_NOTICE,
  BATCH_REFUSED_MESSAGE,
  BODY_TOO_LARGE_ANSWER,
  PAYLOAD_TOO_LARGE_STATUS,
  PROMPTS,
  SERVER_INSTRUCTIONS,
} from "./constants.ts";
import type { McpBody, McpEndpointOptions } from "./types.ts";

// A write tool names the environment in its own description, because agents read it right before calling.
function describeTool(tool: ToolDef, environmentLine: string): string {
  return tool.access === "write"
    ? `${tool.description} ${environmentLine}`
    : tool.description;
}

// Reads are idempotent and destructive-free by construction; only a write tool declares its own.
function hintsOf(tool: ToolDef): ToolAnnotations {
  const behavior =
    tool.access === "read"
      ? { destructiveHint: false, idempotentHint: true }
      : { destructiveHint: tool.destructive, idempotentHint: tool.idempotent };
  return {
    readOnlyHint: tool.access === "read",
    ...behavior,
    openWorldHint: true,
  };
}

function registerPrompts(server: McpServer, mode: AccessMode): void {
  for (const { name, title, description, text, readOnlyText } of PROMPTS) {
    const offered = mode === "read-only" ? readOnlyText : text;
    if (!offered) continue;
    server.registerPrompt(name, { title, description }, () => ({
      messages: [{ role: "user", content: { type: "text", text: offered } }],
    }));
  }
}

// What a tool declares about its effect decides, never its name, so a new write tool is left out by default.
function toolsFor(options: McpEndpointOptions): readonly ToolDef[] {
  return options.mode === "read-only"
    ? options.tools.filter(({ access }) => access === "read")
    : options.tools;
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
    instructions: `Servidor MCP de Cresium: API V3 de partners y documentación. ${environmentLine}${ACCESS_NOTICE[options.mode]}\n${SERVER_INSTRUCTIONS[options.mode]}`,
  });
  registerPrompts(server, options.mode);
  const logger = options.logger.child({
    environment: session.environment,
    companyId: session.credentials.companyId,
    apiKeyMasked: maskApiKey(session.credentials.apiKey),
  });
  for (const tool of toolsFor(options)) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: describeTool(tool, environmentLine),
        inputSchema: tool.input,
        annotations: hintsOf(tool),
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

function parseBody(text: string): McpBody {
  try {
    const value: unknown = JSON.parse(text);
    return { kind: "parsed", value };
  } catch {
    return { kind: "unparsed", text };
  }
}

// The SDK's 2025-era fallback runs every message of a batch at once, so one POST could fan out into
// 100 signed calls, and two identical ones collide on mage's "Signature already used". The SDK has no
// option to refuse batches, so the body is read here once and handed on parsed. A parsed body skips
// the SDK's own size check, so its 413 is answered here; a body that is not JSON goes on unparsed
// for the SDK to answer.
async function readMcpBody(request: Request): Promise<McpBody> {
  if (
    request.method.toUpperCase() !== "POST" ||
    !isJsonContentType(request.headers.get("content-type"))
  ) {
    return { kind: "untouched" };
  }
  const read = await readRequestBody(request, DEFAULT_MAX_REQUEST_BODY_SIZE);
  if (read.tooLarge) return { kind: "tooLarge" };
  return parseBody(read.text);
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
    const body = await readMcpBody(request);
    if (body.kind === "tooLarge") {
      return Response.json(BODY_TOO_LARGE_ANSWER, {
        status: PAYLOAD_TOO_LARGE_STATUS,
      });
    }
    if (body.kind === "parsed" && Array.isArray(body.value)) {
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
    // listChanged notifications and the SDK's subscription cap would only apply within this one request if ever enabled.
    const handler = createMcpHandler(() => buildMcpServer(options, session), {
      onerror: (error) => {
        options.logger.error({ err: error }, "mcp handler error");
      },
    });
    switch (body.kind) {
      case "parsed":
        return await handler.fetch(request, { parsedBody: body.value });
      case "unparsed":
        return await handler.fetch(
          new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: body.text,
            signal: request.signal,
          }),
        );
      case "untouched":
        return await handler.fetch(request);
    }
  };
}

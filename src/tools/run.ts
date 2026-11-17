import type { CallToolResult } from "@modelcontextprotocol/server";

import { rejectOnAbort } from "./abort.ts";
import { TRACE_ID_PREFIX } from "./constants.ts";
import { ToolError } from "./errors.ts";
import type { ToolCall, ToolContext } from "./types.ts";

/** Every failed call ends with its trace id: support needs it most when a write may have been applied. */
function errorResult(text: string, { traceId }: ToolContext): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `${text} ${TRACE_ID_PREFIX} ${traceId}.` }],
  };
}

function describeFailure({ tool, context }: ToolCall, error: unknown): string {
  if (context.signal.aborted) return `${tool.name} fue cancelada.`;
  context.logger.error({ tool: tool.name, err: error }, "tool failed");
  return `Error interno ejecutando ${tool.name}. Quedó registrado en el log.`;
}

async function execute(
  call: ToolCall,
  timeoutMs: number,
): Promise<CallToolResult> {
  const { tool, input, context } = call;
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) {
    return errorResult(`Input inválido: ${parsed.error.message}`, context);
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([context.signal, timeout]);
  try {
    const text = await Promise.race([
      tool.run(parsed.data, { ...context, signal }),
      rejectOnAbort(signal),
    ]);
    return { content: [{ type: "text", text }] };
  } catch (error) {
    if (error instanceof ToolError) return errorResult(error.message, context);
    const message = timeout.aborted
      ? `${tool.name} superó el tiempo máximo de ${timeoutMs / 1000}s.`
      : describeFailure(call, error);
    // Any failure we cannot attribute may have happened after Cresium applied the write.
    return errorResult(
      tool.access === "write"
        ? `${message} ${tool.unknownOutcomeAdvice}`
        : message,
      context,
    );
  }
}

export async function runTool(
  call: ToolCall,
  timeoutMs: number,
): Promise<CallToolResult> {
  const startedAt = performance.now();
  const result = await execute(call, timeoutMs);
  call.context.logger.info(
    {
      tool: call.tool.name,
      isError: result.isError === true,
      durationMs: Math.round(performance.now() - startedAt),
    },
    "tool call",
  );
  return result;
}

import type { CallToolResult } from "@modelcontextprotocol/server";

import { UserFacingError } from "../errors.ts";
import type { RunOptions, ToolCall } from "./types.ts";

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    const fail = (): void => {
      reject(
        signal.reason instanceof Error ? signal.reason : new Error("aborted"),
      );
    };
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener("abort", fail, { once: true });
  });
}

function errorResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

function describeFailure({ tool, context }: ToolCall, error: unknown): string {
  if (context.signal.aborted) return `${tool.name} fue cancelada.`;
  context.logger.error({ tool: tool.name, err: error }, "tool failed");
  return `Error interno ejecutando ${tool.name}. Quedó registrado en el log.`;
}

function withAdvice({ tool }: ToolCall, message: string): string {
  return tool.access === "write"
    ? `${message} ${tool.unknownOutcomeAdvice}`
    : message;
}

async function execute(
  call: ToolCall,
  { timeoutMs, ensureConnected }: RunOptions,
): Promise<CallToolResult> {
  const { tool, input, context } = call;
  const parsed = tool.input.safeParse(input);
  if (!parsed.success) {
    return errorResult(`Input inválido: ${parsed.error.message}`);
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([context.signal, timeout]);
  const runContext = { ...context, signal };
  let toolStarted = false;
  try {
    signal.throwIfAborted();
    if (tool.requiresVerifiedPartner) {
      await Promise.race([ensureConnected(runContext), rejectOnAbort(signal)]);
    }
    signal.throwIfAborted();
    toolStarted = true;
    const text = await Promise.race([
      tool.run(parsed.data, runContext),
      rejectOnAbort(signal),
    ]);
    return { content: [{ type: "text", text }] };
  } catch (error) {
    if (error instanceof UserFacingError) {
      if (error.cause != null) {
        context.logger.warn(
          { tool: tool.name, err: error.cause },
          "tool failed",
        );
      }
      return errorResult(
        error.outcomeUnknown && toolStarted
          ? withAdvice(call, error.message)
          : error.message,
      );
    }
    const message = timeout.aborted
      ? `${tool.name} superó el tiempo máximo de ${timeoutMs / 1000}s.`
      : describeFailure(call, error);
    // Any failure we cannot attribute may have happened after Cresium applied the write.
    return errorResult(toolStarted ? withAdvice(call, message) : message);
  }
}

export async function runTool(
  call: ToolCall,
  options: RunOptions,
): Promise<CallToolResult> {
  const startedAt = performance.now();
  const result = await execute(call, options);
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

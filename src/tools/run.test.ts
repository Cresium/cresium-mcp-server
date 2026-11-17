import { describe, expect, it } from "bun:test";
import type { Logger } from "pino";
import * as z from "zod";

import { createLogger } from "../logger.ts";
import { defineTool } from "./define.ts";
import { ToolError } from "./errors.ts";
import { runTool } from "./run.ts";
import type { ToolCall, ToolDef } from "./types.ts";

function capture(): {
  lines: string[];
  logger: ReturnType<typeof createLogger>;
} {
  const lines: string[] = [];
  const logger = createLogger("info", {
    write: (line: string) => {
      lines.push(line);
    },
  });
  return { lines, logger };
}

function call(
  tool: ToolDef,
  input: unknown,
  logger: Logger = capture().logger,
): ToolCall {
  return {
    tool,
    input,
    context: {
      session: {
        environment: "sandbox" as const,
        apiBaseUrl: "http://localhost:9",
        credentials: { apiKey: "k", secret: "s", companyId: "1" },
      },
      logger,
      signal: new AbortController().signal,
    },
  };
}

const echo = defineTool({
  name: "test_echo",
  description: "echo",
  input: z.object({ text: z.string() }),
  access: "read",
  run: ({ text }, ctx) => Promise.resolve(`${ctx.session.environment}:${text}`),
});

function failing(error: Error): ToolDef {
  return defineTool({
    name: "test_fail",
    description: "fails",
    input: z.object({}),
    access: "read",
    run: () => Promise.reject(error),
  });
}

describe("runTool", () => {
  it("returns the tool's text as content and logs the call", async () => {
    const { lines, logger } = capture();
    const result = await runTool(call(echo, { text: "hola" }, logger), 1000);
    expect(result).toEqual({
      content: [{ type: "text", text: "sandbox:hola" }],
    });
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      msg: "tool call",
      tool: "test_echo",
      isError: false,
    });
  });

  it("answers invalid input as an error result without running the tool", async () => {
    const result = await runTool(call(echo, { text: 1 }), 1000);
    expect(result.isError).toBe(true);
  });

  it("shows a ToolError's message to the caller", async () => {
    const result = await runTool(
      call(failing(new ToolError("Una sola sentencia.")), {}),
      1000,
    );
    expect(result).toEqual({
      isError: true,
      content: [{ type: "text", text: "Una sola sentencia." }],
    });
  });

  it("hides any other error from the caller and logs it", async () => {
    const { lines, logger } = capture();
    const result = await runTool(
      call(failing(new Error("connect ECONNREFUSED 10.0.0.1")), {}, logger),
      1000,
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("ECONNREFUSED");
    expect(lines.join("")).toContain("ECONNREFUSED");
  });

  it("times out a tool that ignores its abort signal", async () => {
    const slow = defineTool({
      name: "test_slow",
      description: "never ends",
      input: z.object({}),
      access: "read",
      run: () => new Promise<string>(() => undefined),
    });
    const result = await runTool(call(slow, {}), 50);
    expect(result).toEqual({
      isError: true,
      content: [
        { type: "text", text: "test_slow superó el tiempo máximo de 0.05s." },
      ],
    });
  });

  it("aborts the signal it hands the tool when the timeout fires", async () => {
    let seen: AbortSignal | undefined;
    const watcher = defineTool({
      name: "test_watch",
      description: "waits for abort",
      input: z.object({}),
      access: "read",
      run: (_input, ctx) => {
        seen = ctx.signal;
        return new Promise<string>(() => undefined);
      },
    });
    await runTool(call(watcher, {}), 20);
    expect(seen?.aborted).toBe(true);
  });

  it("tells the agent a timed-out write may have happened, so it checks before retrying", async () => {
    const slowWrite = defineTool({
      name: "test_write",
      description: "never ends",
      input: z.object({}),
      access: "write",
      run: () => new Promise<string>(() => undefined),
    });
    const result = await runTool(call(slowWrite, {}), 20);
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("antes de reintentar");
  });

  it("warns that a write failing for an unknown reason may have happened", async () => {
    const result = await runTool(
      call(
        defineTool({
          name: "test_write",
          description: "connection drops",
          input: z.object({}),
          access: "write",
          run: () => Promise.reject(new TypeError("fetch failed")),
        }),
        {},
      ),
      1000,
    );
    expect(JSON.stringify(result)).toContain("antes de reintentar");
  });

  it("does not add the write warning to a read", async () => {
    const result = await runTool(
      call(failing(new Error("connect ECONNREFUSED")), {}),
      1000,
    );
    expect(JSON.stringify(result)).not.toContain("antes de reintentar");
  });
});

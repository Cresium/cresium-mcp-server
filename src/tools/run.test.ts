import type { CallToolResult } from "@modelcontextprotocol/server";
import { describe, expect, it } from "bun:test";
import type { Logger } from "pino";
import * as z from "zod";

import { captureLogger } from "../../test/support/capture-logger.ts";
import { UserFacingError } from "../errors.ts";
import { defineTool } from "./define.ts";
import { runTool } from "./run.ts";
import type { RunOptions, ToolCall, ToolDef } from "./types.ts";

const WRITE_ADVICE = "Verificá el estado antes de reintentar.";

function allowing(timeoutMs: number): RunOptions {
  return { timeoutMs, ensureConnected: () => Promise.resolve() };
}

function call(
  tool: ToolDef,
  input: unknown,
  logger: Logger = captureLogger().logger,
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
  title: "Prueba",
  description: "echo",
  input: z.object({ text: z.string() }),
  access: "read",
  run: ({ text }, ctx) => Promise.resolve(`${ctx.session.environment}:${text}`),
});

function errorText(result: CallToolResult): string {
  const [first] = result.content;
  return first?.type === "text" ? first.text : "";
}

function failing(error: Error): ToolDef {
  return defineTool({
    name: "test_fail",
    title: "Prueba",
    description: "fails",
    input: z.object({}),
    access: "read",
    run: () => Promise.reject(error),
  });
}

describe("runTool", () => {
  it("returns the tool's text as content and logs the call", async () => {
    const { lines, logger } = captureLogger();
    const result = await runTool(
      call(echo, { text: "hola" }, logger),
      allowing(1000),
    );
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
    const result = await runTool(call(echo, { text: 1 }), allowing(1000));
    expect(result.isError).toBe(true);
    expect(errorText(result)).toStartWith("Input inválido:");
  });

  it("shows a UserFacingError's message to the caller", async () => {
    const result = await runTool(
      call(failing(new UserFacingError("Una sola sentencia.")), {}),
      allowing(1000),
    );
    expect(result).toEqual({
      isError: true,
      content: [{ type: "text", text: "Una sola sentencia." }],
    });
  });

  it("hides any other error from the caller, and logs it", async () => {
    const { lines, logger } = captureLogger();
    const result = await runTool(
      call(failing(new Error("connect ECONNREFUSED 10.0.0.1")), {}, logger),
      allowing(1000),
    );
    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "Error interno ejecutando test_fail. Quedó registrado en el log.",
        },
      ],
    });
    expect(lines.join("")).toContain("ECONNREFUSED");
  });

  it("times out a tool that ignores its abort signal", async () => {
    const slow = defineTool({
      name: "test_slow",
      title: "Prueba",
      description: "never ends",
      input: z.object({}),
      access: "read",
      run: () => new Promise<string>(() => undefined),
    });
    const result = await runTool(call(slow, {}), allowing(50));
    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "test_slow superó el tiempo máximo de 0.05s.",
        },
      ],
    });
  });

  it("aborts the signal it hands the tool when the timeout fires", async () => {
    let seen: AbortSignal | undefined;
    const watcher = defineTool({
      name: "test_watch",
      title: "Prueba",
      description: "waits for abort",
      input: z.object({}),
      access: "read",
      run: (_input, ctx) => {
        seen = ctx.signal;
        return new Promise<string>(() => undefined);
      },
    });
    await runTool(call(watcher, {}), allowing(20));
    expect(seen?.aborted).toBe(true);
  });

  it("tells the agent a timed-out write may have happened", async () => {
    const slowWrite = defineTool({
      name: "test_write",
      title: "Prueba",
      description: "never ends",
      input: z.object({}),
      access: "write",
      destructive: false,
      idempotent: false,
      unknownOutcomeAdvice: WRITE_ADVICE,
      run: () => new Promise<string>(() => undefined),
    });
    const result = await runTool(call(slowWrite, {}), allowing(20));
    expect(result.isError).toBe(true);
    expect(errorText(result)).toStartWith(
      "test_write superó el tiempo máximo de 0.02s.",
    );
    expect(errorText(result)).toContain(WRITE_ADVICE);
  });

  it("warns that a write failing for an unknown reason may have happened", async () => {
    const result = await runTool(
      call(
        defineTool({
          name: "test_write",
          title: "Prueba",
          description: "connection drops",
          input: z.object({}),
          access: "write",
          destructive: false,
          idempotent: false,
          unknownOutcomeAdvice: WRITE_ADVICE,
          run: () => Promise.reject(new TypeError("fetch failed")),
        }),
        {},
      ),
      allowing(1000),
    );
    expect(errorText(result)).toContain(WRITE_ADVICE);
  });

  it("adds a write's advice to a UserFacingError that says the outcome is unknown, and only to that one", async () => {
    const failingWrite = (error: UserFacingError): ToolDef =>
      defineTool({
        name: "test_write",
        title: "Prueba",
        description: "fails",
        input: z.object({}),
        access: "write",
        destructive: false,
        idempotent: false,
        unknownOutcomeAdvice: WRITE_ADVICE,
        run: () => Promise.reject(error),
      });
    const unknown = await runTool(
      call(
        failingWrite(new UserFacingError("Falló.", { outcomeUnknown: true })),
        {},
      ),
      allowing(1000),
    );
    const known = await runTool(
      call(failingWrite(new UserFacingError("Falló.")), {}),
      allowing(1000),
    );
    expect(errorText(unknown)).toBe(`Falló. ${WRITE_ADVICE}`);
    expect(errorText(known)).toBe("Falló.");
  });

  it("runs a tool that requires a verified partner only after the guard accepts", async () => {
    let ran = false;
    const guarded = defineTool({
      name: "test_guarded",
      title: "Prueba",
      description: "needs a verified partner",
      input: z.object({}),
      access: "read",
      requiresVerifiedPartner: true,
      run: () => {
        ran = true;
        return Promise.resolve("listo");
      },
    });
    const refusing: RunOptions = {
      timeoutMs: 1000,
      ensureConnected: () =>
        Promise.reject(new UserFacingError("Credenciales rechazadas.")),
    };
    const refused = await runTool(call(guarded, {}), refusing);
    expect(refused).toEqual({
      isError: true,
      content: [{ type: "text", text: "Credenciales rechazadas." }],
    });
    expect(ran).toBe(false);
    const accepted = await runTool(call(guarded, {}), allowing(1000));
    expect(errorText(accepted)).toBe("listo");
    expect(ran).toBe(true);
  });

  it("does not ask the guard about a tool that does not require a verified partner", async () => {
    const refusing: RunOptions = {
      timeoutMs: 1000,
      ensureConnected: () =>
        Promise.reject(new UserFacingError("Credenciales rechazadas.")),
    };
    const result = await runTool(call(echo, { text: "hola" }), refusing);
    expect(result.isError).toBeUndefined();
  });

  it("does not add the write warning to a read", async () => {
    const result = await runTool(
      call(failing(new Error("connect ECONNREFUSED")), {}),
      allowing(1000),
    );
    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "Error interno ejecutando test_fail. Quedó registrado en el log.",
        },
      ],
    });
  });
});

it.each(["read", "write"] as const)(
  "cancels a running %s and keeps write outcome advice",
  async (access) => {
    const started = Promise.withResolvers<undefined>();
    const controller = new AbortController();
    const tool = defineTool({
      name: "test_cancel",
      title: "Prueba",
      description: "cancel",
      input: z.object({}),
      access,
      destructive: false,
      idempotent: false,
      unknownOutcomeAdvice: WRITE_ADVICE,
      run: () => {
        started.resolve(undefined);
        return new Promise<string>(() => undefined);
      },
    });
    const invocation = call(tool, {});
    const result = runTool(
      {
        ...invocation,
        context: { ...invocation.context, signal: controller.signal },
      },
      allowing(1000),
    );
    await started.promise;
    controller.abort();
    expect(await result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: `test_cancel fue cancelada.${access === "write" ? ` ${WRITE_ADVICE}` : ""}`,
        },
      ],
    });
  },
);

it("does not start a write after cancellation during the connection check", async () => {
  const checking = Promise.withResolvers<undefined>();
  const verified = Promise.withResolvers<undefined>();
  const controller = new AbortController();
  let runs = 0;
  const tool = defineTool({
    name: "test_guarded_write",
    title: "Prueba",
    description: "cancel before sending",
    input: z.object({}),
    access: "write",
    destructive: false,
    idempotent: false,
    unknownOutcomeAdvice: WRITE_ADVICE,
    requiresVerifiedPartner: true,
    run: () => {
      runs += 1;
      return Promise.resolve("sent");
    },
  });
  const invocation = call(tool, {});
  const result = runTool(
    {
      ...invocation,
      context: { ...invocation.context, signal: controller.signal },
    },
    {
      timeoutMs: 1000,
      ensureConnected: () => {
        checking.resolve(undefined);
        return verified.promise;
      },
    },
  );
  await checking.promise;
  controller.abort();
  expect(errorText(await result)).toBe("test_guarded_write fue cancelada.");
  verified.resolve(undefined);
  await verified.promise;
  expect(runs).toBe(0);
});

it("never starts a tool for an already cancelled request", async () => {
  let runs = 0;
  const tool = defineTool({
    name: "test_cancelled",
    title: "Prueba",
    description: "cancelled",
    input: z.object({}),
    access: "write",
    destructive: false,
    idempotent: false,
    unknownOutcomeAdvice: WRITE_ADVICE,
    run: () => {
      runs += 1;
      return Promise.resolve("sent");
    },
  });
  const invocation = call(tool, {});
  const result = await runTool(
    {
      ...invocation,
      context: { ...invocation.context, signal: AbortSignal.abort() },
    },
    allowing(1000),
  );
  expect(errorText(result)).toBe("test_cancelled fue cancelada.");
  expect(runs).toBe(0);
});

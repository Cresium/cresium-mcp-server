import * as z from "zod";

import { SERVER_ERROR_STATUS, UNAUTHORIZED_STATUS } from "../constants.ts";
import { callCresium } from "../cresium/client.ts";
import { toCresiumRequest } from "../cresium/request.ts";
import { operationCallSchema } from "../cresium/schema.ts";
import type { CresiumResponse } from "../cresium/types.ts";
import { UNKNOWN_WRITE_OUTCOME } from "../tools/constants.ts";
import { defineTool } from "../tools/define.ts";
import { ToolError } from "../tools/errors.ts";
import type {
  ToolAccess,
  ToolContext,
  ToolDef,
  ToolName,
} from "../tools/types.ts";
import { findOperation, searchOperations } from "./operations.ts";
import type { Operation } from "./types.ts";

const SEARCH_LIMIT = 8;

export function accessOf(operation: Operation): ToolAccess {
  return operation.method === "GET" ? "read" : "write";
}

const callInput = operationCallSchema.extend({
  operation: z
    .string()
    .describe(
      'Id de la operación tal como lo devuelve search_api, por ejemplo "GET /v3/balance/".',
    ),
});

type ApiCallRequest = z.infer<typeof callInput>;

function describeOperation(operation: Operation): unknown {
  return {
    operation: operation.id,
    summary: operation.summary,
    description: operation.description,
    access: accessOf(operation),
    parameters: operation.parameters,
    body: operation.body,
  };
}

async function callOperation(
  input: ApiCallRequest,
  operation: Operation,
  ctx: ToolContext,
): Promise<string> {
  const request = toCresiumRequest(operation, input);
  const startedAt = performance.now();
  let status: number | "failed" = "failed";
  try {
    const response = await callCresium(
      { baseUrl: ctx.session.apiBaseUrl, credentials: ctx.session.credentials },
      request,
      ctx.signal,
    );
    status = response.status;
    return toolText(response, operation, ctx);
  } finally {
    ctx.logger.info(
      {
        operation: operation.id,
        status,
        durationMs: Math.round(performance.now() - startedAt),
      },
      "cresium api call",
    );
  }
}

function toolText(
  response: CresiumResponse,
  operation: Operation,
  ctx: ToolContext,
): string {
  const text = JSON.stringify(response.body, null, 2);
  if (response.status === UNAUTHORIZED_STATUS) {
    throw new ToolError(
      `Cresium rechazó el pedido (401). Revisá x-api-key, x-api-secret y x-company-id, y que la key sea de ${ctx.session.environment}. Respuesta: ${text}`,
    );
  }
  const failed = `Cresium respondió ${response.status}: ${text}`;
  // A 5xx (often a gateway timeout) can arrive after the write was applied.
  const writeMayHaveApplied =
    response.status >= SERVER_ERROR_STATUS && accessOf(operation) === "write";
  if (writeMayHaveApplied) {
    throw new ToolError(`${failed} ${UNKNOWN_WRITE_OUTCOME}`);
  }
  if (response.status >= 400) throw new ToolError(failed);
  return text;
}

const searchApiTool = defineTool({
  name: "search_api",
  description:
    "Busca operaciones de la API V3 de Cresium (CVUs, pagos, transferencias, saldo, transacciones, facturas, firmas, comisiones, sandbox) por palabras en español o por path. Devuelve el id de cada operación, si lee o escribe, sus parámetros y el schema del body. Usala antes de read_api o write_api. Sin query lista todas; con query devuelve las 8 más relevantes.",
  input: z.object({
    query: z
      .string()
      .default("")
      .describe(
        'Palabras a buscar, por ejemplo "emitir cvu" o "transacciones".',
      ),
  }),
  access: "read",
  run: ({ query }) => {
    const found = searchOperations(query, SEARCH_LIMIT);
    if (found.length === 0) {
      return Promise.resolve(
        `Ninguna operación coincide con "${query}". Probá con otras palabras o con query vacía para ver todas.`,
      );
    }
    return Promise.resolve(
      JSON.stringify(found.map(describeOperation), null, 2),
    );
  },
});

const CALL_TOOLS = {
  read: {
    name: "read_api",
    description:
      "Ejecuta una operación GET de la API V3 de Cresium con las credenciales del partner y devuelve la respuesta JSON. Solo lectura. Para escribir usá write_api.",
    wrongAccess: "escribe datos. Usá write_api para ejecutarla.",
  },
  write: {
    name: "write_api",
    description:
      "Ejecuta una operación de escritura (todo lo que no es GET) de la API V3 de Cresium con las credenciales del partner: crea o modifica datos reales en el ambiente conectado (sandbox o producción). Confirmá con el usuario antes de usarla en producción.",
    wrongAccess: "es de lectura. Usá read_api.",
  },
} as const satisfies Record<
  ToolAccess,
  { name: ToolName; description: string; wrongAccess: string }
>;

function createCallTool(access: ToolAccess): ToolDef {
  const { name, description, wrongAccess } = CALL_TOOLS[access];
  return defineTool({
    name,
    description,
    input: callInput,
    access,
    run: async (input, ctx) => {
      const operation = findOperation(input.operation);
      if (accessOf(operation) !== access) {
        throw new ToolError(`${operation.id} ${wrongAccess}`);
      }
      return await callOperation(input, operation, ctx);
    },
  });
}

export const API_TOOLS: readonly ToolDef[] = [
  searchApiTool,
  createCallTool("read"),
  createCallTool("write"),
];

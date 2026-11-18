import * as z from "zod";

import { previewRequest } from "../cresium/client.ts";
import { DRY_RUN_NOTE } from "../cresium/constants.ts";
import { toCresiumRequest } from "../cresium/request.ts";
import { operationCallSchema } from "../cresium/schema.ts";
import type { CresiumRequest } from "../cresium/types.ts";
import { maskApiKey } from "../partner/credentials.ts";
import { connectedTo } from "../partner/environment.ts";
import type { PartnerSession } from "../partner/types.ts";
import { defineTool } from "../tools/define.ts";
import { ToolError } from "../tools/errors.ts";
import type {
  ToolAccess,
  ToolContext,
  ToolDef,
  ToolEffect,
  ToolName,
} from "../tools/types.ts";
import { accessOf, assertSucceeded, sendRequest, toJsonText } from "./call.ts";
import { checkConnection } from "./connection.ts";
import { API_WRITE_UNKNOWN_OUTCOME, SEARCH_LIMIT } from "./constants.ts";
import { findOperation, OPERATIONS, searchOperations } from "./operations.ts";
import type { Operation } from "./types.ts";

const callInput = operationCallSchema.extend({
  operation: z
    .string()
    .describe(
      'Id de la operación tal como lo devuelve search_api, por ejemplo "GET /v3/balance/".',
    ),
  dryRun: z
    .boolean()
    .default(false)
    .describe(
      "Con true no envía nada: devuelve el pedido exacto (método, URL y body ya normalizado) y el texto que hay que firmar. Sirve para mostrarle al usuario qué se va a ejecutar y para depurar la firma en código propio.",
    ),
});

type ApiCallRequest = z.infer<typeof callInput>;

function summarizeOperation(operation: Operation): unknown {
  return {
    operation: operation.id,
    summary: operation.summary,
    access: accessOf(operation),
  };
}

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

function dryRunText(request: CresiumRequest, session: PartnerSession): string {
  const preview = previewRequest(session.apiBaseUrl, request);
  return toJsonText({
    dryRun: true,
    environment: session.environment,
    ...preview,
    note: DRY_RUN_NOTE,
  });
}

async function callOperation(
  input: ApiCallRequest,
  operation: Operation,
  ctx: ToolContext,
): Promise<string> {
  const request = toCresiumRequest(operation, input);
  if (input.dryRun) return dryRunText(request, ctx.session);
  const response = await sendRequest(request, operation, ctx);
  assertSucceeded(response, operation, ctx.session);
  return toJsonText(response.body);
}

const checkConnectionTool = defineTool({
  name: "check_connection",
  description:
    "Verifica que las credenciales del partner funcionan contra la API de Cresium y dice a qué ambiente está conectado este servidor (sandbox o producción). Usala al empezar y cuando otra tool devuelva un 401: si algo falla, indica cuál de los headers revisar.",
  input: z.object({}),
  access: "read",
  run: async (_input, ctx) => {
    const { environment, apiBaseUrl, credentials } = ctx.session;
    await checkConnection(ctx);
    return `Conexión correcta. ${connectedTo(environment)} API: ${apiBaseUrl}. Empresa: ${credentials.companyId}. API key: ${maskApiKey(credentials.apiKey)}.`;
  },
});

const searchApiTool = defineTool({
  name: "search_api",
  description: `Busca operaciones de la API V3 de Cresium (CVUs, pagos, transferencias, saldo, transacciones, facturas, firmas, comisiones, sandbox) por palabras en español o inglés, o por path. Usala antes de read_api o write_api. Sin query lista todas las operaciones con su id y resumen; con query devuelve las ${SEARCH_LIMIT} más relevantes con sus parámetros y el schema del body.`,
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
    if (query.trim() === "") {
      return Promise.resolve(toJsonText(OPERATIONS.map(summarizeOperation)));
    }
    const found = searchOperations(query, SEARCH_LIMIT);
    if (found.length === 0) {
      return Promise.resolve(
        `Ninguna operación coincide con "${query}". Probá con otras palabras o con query vacía para ver todas.`,
      );
    }
    return Promise.resolve(toJsonText(found.map(describeOperation)));
  },
});

const CALL_TOOLS = {
  read: {
    name: "read_api",
    description:
      "Ejecuta una operación GET de la API V3 de Cresium con las credenciales del partner y devuelve la respuesta JSON. Solo lectura. Para escribir usá write_api. Las búsquedas y los listados devuelven objetos grandes: pedí páginas chicas con pageSize (por ejemplo 5) y acotá con filtros.",
    wrongAccess: "escribe datos. Usá write_api para ejecutarla.",
    effect: { access: "read" },
  },
  write: {
    name: "write_api",
    description:
      "Ejecuta una operación de escritura (todo lo que no es GET) de la API V3 de Cresium con las credenciales del partner: crea o modifica datos reales en el ambiente conectado. Confirmá con el usuario antes de usarla en producción; con dryRun: true podés mostrarle antes el pedido exacto.",
    wrongAccess: "es de lectura. Usá read_api.",
    effect: {
      access: "write",
      unknownOutcomeAdvice: API_WRITE_UNKNOWN_OUTCOME,
    },
  },
} as const satisfies Record<
  ToolAccess,
  {
    name: ToolName;
    description: string;
    wrongAccess: string;
    effect: ToolEffect;
  }
>;

function createCallTool(access: ToolAccess): ToolDef {
  const { name, description, wrongAccess, effect } = CALL_TOOLS[access];
  return defineTool({
    name,
    description,
    input: callInput,
    ...effect,
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
  checkConnectionTool,
  searchApiTool,
  createCallTool("read"),
  createCallTool("write"),
];

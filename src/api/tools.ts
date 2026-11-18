import * as z from "zod";

import { HTTP_METHODS } from "../cresium/constants.ts";
import { previewOperation } from "../cresium/operation.ts";
import { diagnoseSignature } from "../cresium/signature.ts";
import type { Operation } from "../cresium/types.ts";
import { UserFacingError } from "../errors.ts";
import { maskApiKey } from "../partner/credentials.ts";
import { connectedTo } from "../partner/environment.ts";
import { defineTool } from "../tools/define.ts";
import type {
  ToolAccess,
  ToolContext,
  ToolDef,
  ToolEffect,
  ToolName,
} from "../tools/types.ts";
import { callApi } from "./call.ts";
import { checkConnection } from "./connection.ts";
import { API_WRITE_UNKNOWN_OUTCOME, SEARCH_LIMIT } from "./constants.ts";
import {
  accessOf,
  findOperation,
  OPERATIONS,
  searchOperations,
} from "./operations.ts";
import { operationCallSchema } from "./schema.ts";

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

function summarizeOperation(operation: Operation) {
  return {
    operation: operation.id,
    summary: operation.summary,
    access: accessOf(operation),
  };
}

function describeOperation(operation: Operation) {
  return {
    operation: operation.id,
    summary: operation.summary,
    description: operation.description,
    access: accessOf(operation),
    parameters: operation.parameters,
    body: operation.body,
  };
}

async function runOperation(
  input: ApiCallRequest,
  operation: Operation,
  ctx: ToolContext,
): Promise<string> {
  if (input.dryRun) {
    return JSON.stringify(previewOperation(ctx.session, operation, input));
  }
  return JSON.stringify(await callApi(ctx, operation, input));
}

const checkConnectionTool = defineTool({
  name: "check_connection",
  title: "Verificar la conexión con Cresium",
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

function searchText(query: string): string {
  if (query.trim() === "") {
    return JSON.stringify(OPERATIONS.map(summarizeOperation));
  }
  const found = searchOperations(query, SEARCH_LIMIT);
  if (found.length === 0) {
    return `Ninguna operación coincide con "${query}". Probá con otras palabras o con query vacía para ver todas. Para webhooks y guías usá search_docs.`;
  }
  return JSON.stringify(found.map(describeOperation));
}

const searchApiTool = defineTool({
  name: "search_api",
  title: "Buscar operaciones de la API",
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
  run: ({ query }) => Promise.resolve(searchText(query)),
});

const diagnoseSignatureTool = defineTool({
  name: "diagnose_signature",
  title: "Diagnosticar una firma inválida",
  description:
    'Diagnostica un "Invalid signature": dice si la firma del código del partner es válida para su secret y, si no, qué error común la produce. No llama a Cresium.',
  input: z.object({
    kind: z
      .enum(["request", "webhook"])
      .describe("Pedido a la API o webhook recibido."),
    timestamp: z.string().describe("x-timestamp."),
    method: z
      .enum(HTTP_METHODS)
      .optional()
      .describe("Obligatorio en request; un webhook es POST."),
    url: z
      .string()
      .describe("request: path con query. webhook: URL completa registrada."),
    body: z.string().default("").describe("Body crudo; vacío si no hay."),
    signature: z
      .string()
      .describe("x-signature que calculó el código del partner."),
  }),
  access: "read",
  run: ({ method, ...check }, ctx) => {
    if (check.kind === "request" && !method) {
      throw new UserFacingError(
        "Un request necesita method (GET, POST, PUT, PATCH o DELETE).",
      );
    }
    return Promise.resolve(
      JSON.stringify(
        diagnoseSignature(
          ctx.session,
          { ...check, method: method ?? "POST" },
          new Date(),
        ),
      ),
    );
  },
});

const CALL_TOOLS = {
  read: {
    name: "read_api",
    title: "Leer de la API",
    description:
      "Ejecuta una operación GET de la API V3 de Cresium con las credenciales del partner y devuelve la respuesta JSON. Solo lectura. Para escribir usá write_api. Las búsquedas y los listados devuelven objetos grandes: pedí páginas chicas con pageSize (por ejemplo 5) y acotá con filtros.",
    wrongAccess: "escribe datos. Usá write_api para ejecutarla.",
    effect: { access: "read" },
  },
  write: {
    name: "write_api",
    title: "Escribir en la API",
    description:
      "Ejecuta una operación de escritura (todo lo que no es GET) de la API V3 de Cresium con las credenciales del partner: crea o modifica datos reales en el ambiente conectado. Confirmá con el usuario antes de usarla en producción; con dryRun: true podés mostrarle antes el pedido exacto.",
    wrongAccess: "es de lectura. Usá read_api.",
    effect: {
      access: "write",
      destructive: true,
      idempotent: false,
      unknownOutcomeAdvice: API_WRITE_UNKNOWN_OUTCOME,
    },
  },
} as const satisfies Record<
  ToolAccess,
  {
    name: ToolName;
    title: string;
    description: string;
    wrongAccess: string;
    effect: ToolEffect;
  }
>;

function createCallTool(access: ToolAccess): ToolDef {
  const { name, title, description, wrongAccess, effect } = CALL_TOOLS[access];
  return defineTool({
    name,
    title,
    description,
    input: callInput,
    ...effect,
    run: async (input, ctx) => {
      const operation = findOperation(input.operation);
      if (accessOf(operation) !== access) {
        throw new UserFacingError(`${operation.id} ${wrongAccess}`);
      }
      return await runOperation(input, operation, ctx);
    },
  });
}

export const API_TOOLS: readonly ToolDef[] = [
  checkConnectionTool,
  searchApiTool,
  diagnoseSignatureTool,
  createCallTool("read"),
  createCallTool("write"),
];

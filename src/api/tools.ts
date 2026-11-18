import * as z from "zod";

import { previewOperation } from "../cresium/operation.ts";
import type { Operation } from "../cresium/types.ts";
import { UserFacingError } from "../errors.ts";
import { maskApiKey } from "../partner/credentials.ts";
import { connectedTo } from "../partner/environment.ts";
import { defineTool } from "../tools/define.ts";
import type {
  AccessMode,
  ToolAccess,
  ToolContext,
  ToolDef,
} from "../tools/types.ts";
import { callApi } from "./call.ts";
import { confirmationFor } from "./confirmation.ts";
import { checkConnection } from "./connection.ts";
import {
  API_WRITE_UNKNOWN_OUTCOME,
  READ_API_NARROWING_ADVICE,
  SCHEMA_HINT,
  SEARCH_LIMIT,
  UNMATCHED_FIELDS_NOTE,
  WRITE_API_WRONG_ACCESS,
  WRITE_GUIDANCE,
} from "./constants.ts";
import {
  accessOf,
  findOperation,
  OPERATIONS,
  searchOperations,
} from "./operations.ts";
import { projectFields } from "./project.ts";
import { operationCallSchema } from "./schema.ts";
import type { WriteGuidance } from "./types.ts";

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

const readInput = callInput.extend({
  fields: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe(
      'Campos a devolver de cada ítem de la lista, como paths con puntos (por ejemplo ["id", "counterparty.name"]); la paginación se conserva y se avisa de los paths que no existen.',
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

function answerText(
  answer: unknown,
  fields: readonly string[] | undefined,
): string {
  if (!fields) return JSON.stringify(answer);
  const { value, unmatched } = projectFields(answer, fields);
  const text = JSON.stringify(value);
  return unmatched.length === 0
    ? text
    : `${text}\n\n${UNMATCHED_FIELDS_NOTE} ${unmatched.join(", ")}`;
}

function withSchemaHint(error: unknown): never {
  if (error instanceof UserFacingError && error.schemaViolation) {
    throw new UserFacingError(`${error.message} ${SCHEMA_HINT}`);
  }
  throw error;
}

async function runOperation(
  input: ApiCallRequest & { readonly fields?: readonly string[] | undefined },
  operation: Operation,
  ctx: ToolContext,
): Promise<string> {
  try {
    if (input.dryRun) {
      return JSON.stringify(previewOperation(ctx.session, operation, input));
    }
    return answerText(await callApi(ctx, operation, input), input.fields);
  } catch (error) {
    return withSchemaHint(error);
  }
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

const searchApiTool = (guidance: WriteGuidance) =>
  defineTool({
    name: "search_api",
    title: "Buscar operaciones de la API",
    description: `Busca operaciones de la API V3 de Cresium (CVUs, pagos, transferencias, saldo, transacciones, facturas, firmas, comisiones, sandbox) por palabras en español o inglés, o por path. ${guidance.beforeCalling} Sin query lista todas las operaciones con su id y resumen; con query devuelve las ${SEARCH_LIMIT} más relevantes con sus parámetros y el schema del body.`,
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

/** The operation `id`, refused with `wrongAccess` after its id when it is not a `access` operation. */
function operationFor(
  id: string,
  access: ToolAccess,
  wrongAccess: string,
): Operation {
  const operation = findOperation(id);
  if (accessOf(operation) !== access) {
    throw new UserFacingError(`${operation.id} ${wrongAccess}`);
  }
  return operation;
}

const readApiTool = (guidance: WriteGuidance) =>
  defineTool({
    name: "read_api",
    title: "Leer de la API",
    description: `Ejecuta una operación GET de la API V3 de Cresium con las credenciales del partner y devuelve la respuesta JSON. Solo lectura. ${guidance.readDescription} Las búsquedas y los listados devuelven objetos grandes: pedí páginas chicas con pageSize (por ejemplo 5) y acotá con filtros.`,
    narrowingAdvice: READ_API_NARROWING_ADVICE,
    input: readInput,
    access: "read",
    run: async (input, ctx) =>
      await runOperation(
        input,
        operationFor(input.operation, "read", guidance.readWrongAccess),
        ctx,
      ),
  });

const writeApiTool = defineTool({
  name: "write_api",
  title: "Escribir en la API",
  description:
    "Ejecuta una operación de escritura (todo lo que no es GET) de la API V3 de Cresium con las credenciales del partner: crea o modifica datos reales en el ambiente conectado. Confirmá con el usuario antes de usarla en producción; con dryRun: true podés mostrarle antes el pedido exacto.",
  input: callInput,
  access: "write",
  destructive: true,
  idempotent: false,
  unknownOutcomeAdvice: API_WRITE_UNKNOWN_OUTCOME,
  confirmation: {
    request: (input, session) => {
      if (input.dryRun) return;
      try {
        const operation = operationFor(
          input.operation,
          "write",
          WRITE_API_WRONG_ACCESS,
        );
        return confirmationFor(
          operation.id,
          previewOperation(session, operation, input),
        );
      } catch (error) {
        return withSchemaHint(error);
      }
    },
  },
  run: async (input, ctx) =>
    await runOperation(
      input,
      operationFor(input.operation, "write", WRITE_API_WRONG_ACCESS),
      ctx,
    ),
});

/** The API tools as a connection with `mode` describes them; the MCP layer leaves out the write tool on a read-only one. */
export function createApiTools(mode: AccessMode): readonly ToolDef[] {
  const guidance = WRITE_GUIDANCE[mode];
  return [
    checkConnectionTool,
    searchApiTool(guidance),
    readApiTool(guidance),
    writeApiTool,
  ];
}

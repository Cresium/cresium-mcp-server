import { Ajv } from "ajv";

import type { Operation } from "../api/types.ts";
import { ToolError } from "../tools/errors.ts";
import { UNSAFE_PATH_VALUES } from "./constants.ts";
import type { CresiumRequest, OperationCall, QueryValue } from "./types.ts";

// Fastify 4's default Ajv options, which mage uses. Fastify validates (and mutates) the body before mage
// checks the HMAC against JSON.stringify(request.body), so the body must be signed after the same mutation:
// `amount: "1"` signed as-is fails with "Invalid signature" (verified against sandbox).
const ajv = new Ajv({
  coerceTypes: "array",
  useDefaults: true,
  removeAdditional: true,
  allErrors: false,
  strict: false,
  validateFormats: false,
});

function toBody(operation: Operation, body: unknown): unknown {
  if (!body) return;
  if (!operation.body) {
    throw new ToolError(`${operation.id} no recibe body.`);
  }
  const prepared = structuredClone(body);
  const validate = ajv.compile(operation.body);
  if (!validate(prepared)) {
    throw new ToolError(
      `Body inválido para ${operation.id}: ${ajv.errorsText(validate.errors)}. Revisá el schema con search_api.`,
    );
  }
  return prepared;
}

function toQueryPairs(name: string, value: QueryValue): [string, string][] {
  // mage parses repeated `name[]` keys as an array.
  if (Array.isArray(value)) {
    return value.map((item) => [`${name}[]`, String(item)]);
  }
  return [[name, String(value)]];
}

function toUrl(
  operation: Operation,
  { pathParams, query }: OperationCall,
): string {
  const declared = new Set(
    operation.parameters.map((param) => `${param.in}:${param.name}`),
  );
  const unknown = [
    ...Object.keys(pathParams).map((name) => `path:${name}`),
    ...Object.keys(query).map((name) => `query:${name}`),
  ].filter((key) => !declared.has(key));
  const unsafe = Object.entries(pathParams)
    .filter(([, value]) => UNSAFE_PATH_VALUES.has(String(value)))
    .map(([name]) => `path:${name}`);
  const missing = operation.parameters
    .filter((param) => param.required)
    .filter((param) =>
      param.in === "path"
        ? pathParams[param.name] == null
        : query[param.name] == null,
    )
    .map((param) => `${param.in}:${param.name}`);
  const problems = [
    ...(missing.length > 0 ? [`faltan ${missing.join(", ")}`] : []),
    ...(unknown.length > 0 ? [`no existen ${unknown.join(", ")}`] : []),
    ...(unsafe.length > 0
      ? [`vacíos o "." / ".." en ${unsafe.join(", ")}`]
      : []),
  ];
  if (problems.length > 0) {
    throw new ToolError(
      `Parámetros inválidos para ${operation.id}: ${problems.join("; ")}.`,
    );
  }
  const path = operation.path.replace(/\{(\w+)\}/g, (_match, name: string) =>
    encodeURIComponent(String(pathParams[name])),
  );
  const pairs = Object.entries(query).flatMap(([name, value]) =>
    toQueryPairs(name, value),
  );
  const search = new URLSearchParams(pairs).toString();
  return search ? `${path}?${search}` : path;
}

/** The request exactly as mage will parse and verify it, or a ToolError saying why mage would reject the call. */
export function toCresiumRequest(
  operation: Operation,
  call: OperationCall,
): CresiumRequest {
  return {
    method: operation.method,
    url: toUrl(operation, call),
    body: toBody(operation, call.body),
  };
}

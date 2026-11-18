import { Ajv } from "ajv";

import { UserFacingError } from "../errors.ts";
import { UNSAFE_PATH_VALUES } from "./constants.ts";
import type {
  CresiumRequest,
  JsonSchema,
  Operation,
  OperationCall,
  QueryValue,
  UnknownField,
} from "./types.ts";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

// The catalogue's only combinator; its branches are read as one schema.
function branchesOf(schema: JsonSchema): readonly JsonSchema[] {
  const { anyOf } = schema;
  return [schema, ...(Array.isArray(anyOf) ? anyOf.filter(isRecord) : [])];
}

function allowsAnyKey(additionalProperties: unknown): boolean {
  return additionalProperties === true || isRecord(additionalProperties);
}

function unknownFieldsIn(
  schema: JsonSchema,
  value: unknown,
  path: string,
): readonly UnknownField[] {
  const branches = branchesOf(schema);
  if (Array.isArray(value)) {
    const itemSchemas = branches.map(({ items }) => items).filter(isRecord);
    return value.flatMap((item, index) =>
      itemSchemas.flatMap((itemSchema) =>
        unknownFieldsIn(itemSchema, item, `${path}[${index}]`),
      ),
    );
  }
  if (!isRecord(value)) return [];
  const declared = new Map(
    branches
      .map(({ properties }) => properties)
      .filter(isRecord)
      .flatMap((properties) => Object.entries(properties)),
  );
  const flagsExtraKeys =
    declared.size > 0 &&
    !branches.some(({ additionalProperties }) =>
      allowsAnyKey(additionalProperties),
    );
  return Object.entries(value).flatMap(([field, inner]) => {
    const fieldPath = path ? `${path}.${field}` : field;
    const fieldSchema = declared.get(field);
    if (isRecord(fieldSchema)) {
      return unknownFieldsIn(fieldSchema, inner, fieldPath);
    }
    if (declared.has(field) || !flagsExtraKeys) return [];
    return [{ path: fieldPath, parent: path, known: [...declared.keys()] }];
  });
}

function describeUnknownFields(fields: readonly UnknownField[]): string {
  const byParent = Map.groupBy(fields, ({ parent }) => parent);
  const sentences = [...byParent].map(([parent, group]) => {
    const where = parent ? ` en ${parent}` : "";
    const known = group[0]?.known.join(", ") ?? "";
    const paths = group.map(({ path }) => path).join(", ");
    return `${paths}. Campos válidos${where}: ${known}.`;
  });
  return `la API no conoce ${sentences.join(" Tampoco conoce ")}`;
}

// mage ignores a field its schema does not declare, so a typo like `ammount` would be sent and silently dropped.
// Checked on the caller's body, before the validator's `removeAdditional` could strip the typo.
function assertKnownFields(
  operation: Operation,
  schema: JsonSchema,
  body: unknown,
): void {
  const unknownFields = unknownFieldsIn(schema, body, "");
  if (unknownFields.length === 0) return;
  throw new UserFacingError(
    `Body inválido para ${operation.id}: ${describeUnknownFields(unknownFields)}`,
  );
}

function toBody(operation: Operation, body: unknown): unknown {
  if (!body) return;
  if (!operation.body) {
    throw new UserFacingError(`${operation.id} no recibe body.`);
  }
  assertKnownFields(operation, operation.body, body);
  const prepared = structuredClone(body);
  const validate = ajv.compile(operation.body);
  if (!validate(prepared)) {
    throw new UserFacingError(
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
    throw new UserFacingError(
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

/** The request exactly as mage will parse and verify it, or a UserFacingError saying why mage would reject the call. */
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

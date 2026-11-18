import { Ajv } from "ajv";

import { UserFacingError } from "../errors.ts";
import { UNSAFE_PATH_VALUES } from "./constants.ts";
import type {
  CatalogueEntry,
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

/** Compiles the entry's body schema, so a schema the validator cannot handle fails when the catalogue loads, not on a call. */
export function compileOperation(entry: CatalogueEntry): Operation {
  try {
    return {
      ...entry,
      validateBody: entry.body ? ajv.compile(entry.body) : undefined,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot compile the body schema of ${entry.id}: ${reason}`,
      { cause: error },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function allowsAnyKey(additionalProperties: unknown): boolean {
  return additionalProperties === true || isRecord(additionalProperties);
}

// A branch whose `type` cannot describe the value has no say on its fields; Ajv rejects a value no branch admits.
function admits({ type }: JsonSchema, value: unknown): boolean {
  if (type == null) return true;
  const kind = Array.isArray(value) ? "array" : "object";
  return Array.isArray(type) ? type.includes(kind) : type === kind;
}

/** The fields that every branch reports, with the fields any of them knows. */
function rejectedByEvery(
  reports: readonly (readonly UnknownField[])[],
): readonly UnknownField[] {
  const [first = [], ...others] = reports;
  return first.flatMap((field) => {
    const same = others.flatMap((report) =>
      report.filter(({ path }) => path === field.path),
    );
    if (same.length < others.length) return [];
    const known = [field, ...same].flatMap((each) => each.known);
    return [{ ...field, known: [...new Set(known)] }];
  });
}

function unknownFieldsIn(
  schema: JsonSchema,
  value: unknown,
  path: string,
): readonly UnknownField[] {
  if (!Array.isArray(value) && !isRecord(value)) return [];
  const { anyOf, ...shared } = schema;
  // anyOf is the catalogue's only combinator: a field is unknown only if every branch that fits the value rejects it.
  if (Array.isArray(anyOf)) {
    const reports = anyOf
      .filter(isRecord)
      .map((branch) => ({ ...shared, ...branch }))
      .filter((branch) => admits(branch, value))
      .map((branch) => unknownFieldsIn(branch, value, path));
    return rejectedByEvery(reports);
  }
  const { items, properties, additionalProperties } = shared;
  if (Array.isArray(value)) {
    if (!isRecord(items)) return [];
    return value.flatMap((item, index) =>
      unknownFieldsIn(items, item, `${path}[${index}]`),
    );
  }
  const declared = new Map(
    isRecord(properties) ? Object.entries(properties) : [],
  );
  const flagsExtraKeys =
    declared.size > 0 && !allowsAnyKey(additionalProperties);
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
  const { body: schema, validateBody: validate } = operation;
  if (!schema || !validate) {
    throw new UserFacingError(`${operation.id} no recibe body.`);
  }
  assertKnownFields(operation, schema, body);
  const prepared = structuredClone(body);
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
  // A lone surrogate cannot be percent-encoded: encodeURIComponent would throw.
  const unsafe = Object.entries(pathParams)
    .map(([name, value]) => [name, String(value)] as const)
    .filter(
      ([, value]) => UNSAFE_PATH_VALUES.has(value) || !value.isWellFormed(),
    )
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
      ? [`vacíos, "." / ".." o mal formados en ${unsafe.join(", ")}`]
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

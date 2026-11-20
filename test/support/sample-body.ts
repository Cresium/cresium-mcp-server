import type { JsonSchema, OperationCall } from "../../src/cresium/types.ts";

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function sampleObject(properties: unknown, additional: unknown): JsonSchema {
  const declared: [string, unknown][] = isSchema(properties)
    ? Object.entries(properties).map(([name, schema]) => [
        name,
        isSchema(schema) ? sampleOf(schema) : "1",
      ])
    : [];
  const free: [string, unknown][] = isSchema(additional)
    ? [["clave", sampleOf(additional)]]
    : [];
  return Object.fromEntries([...declared, ...free]);
}

/** A value for every field the schema declares, plus a free key wherever it takes any. Strings are "1" so they also match the catalogue's numeric patterns. */
export function sampleOf(schema: JsonSchema): unknown {
  const {
    anyOf,
    enum: options,
    type,
    properties,
    items,
    additionalProperties,
  } = schema;
  const branch = Array.isArray(anyOf)
    ? anyOf.filter(isSchema).find((each) => each["type"] !== "null")
    : undefined;
  if (branch) return sampleOf(branch);
  const option: unknown = Array.isArray(options) ? options[0] : undefined;
  if (option != null) return option;
  switch (type) {
    case "object":
      return sampleObject(properties, additionalProperties);
    case "array":
      return isSchema(items) ? [sampleOf(items)] : [];
    case "number":
    case "integer":
      return 1;
    case "boolean":
      return true;
    default:
      return "1";
  }
}

export function sampleBody(schema: JsonSchema): OperationCall["body"] {
  const sample = sampleOf(schema);
  if (Array.isArray(sample) || isSchema(sample)) return sample;
  throw new Error("the body schema describes neither an object nor a list");
}

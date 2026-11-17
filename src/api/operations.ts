import * as z from "zod";

import { ToolError } from "../tools/errors.ts";
import { HTTP_METHODS } from "./constants.ts";
import operationsJson from "./operations.json" with { type: "json" };
import type { Operation } from "./types.ts";

const operationSchema: z.ZodType<Operation> = z.object({
  id: z.string(),
  method: z.enum(HTTP_METHODS),
  path: z.string(),
  summary: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  parameters: z.array(
    z.object({
      name: z.string(),
      in: z.enum(["path", "query"]),
      required: z.boolean(),
      description: z.string(),
      schema: z.unknown(),
    }),
  ),
  body: z.record(z.string(), z.unknown()).nullable(),
});

// Parsed at startup so a malformed regeneration of operations.json fails loudly instead of at call time.
export const OPERATIONS: readonly Operation[] = z
  .array(operationSchema)
  .parse(operationsJson);

const OPERATIONS_BY_ID: ReadonlyMap<string, Operation> = new Map(
  OPERATIONS.map((operation) => [operation.id, operation]),
);

export function findOperation(id: string): Operation {
  const operation = OPERATIONS_BY_ID.get(id.trim());
  if (!operation) {
    throw new ToolError(
      `No existe la operación "${id}". Usá search_api para ver los ids válidos, por ejemplo "GET /v3/balance/".`,
    );
  }
  return operation;
}

function searchableText(operation: Operation): string {
  return [
    operation.id,
    operation.summary,
    operation.description,
    ...operation.tags,
  ]
    .join(" ")
    .toLowerCase();
}

export function searchOperations(
  query: string,
  limit: number,
): readonly Operation[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return OPERATIONS;
  return OPERATIONS.map((operation) => {
    const text = searchableText(operation);
    const score = words.filter((word) => text.includes(word)).length;
    return { operation, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ operation }) => operation);
}

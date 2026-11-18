import * as z from "zod";

import { operationSchema } from "../cresium/schema.ts";
import type { Operation } from "../cresium/types.ts";
import { UserFacingError } from "../errors.ts";
import type { ToolAccess } from "../tools/types.ts";
import {
  DESCRIPTION_MATCH_SCORE,
  SEARCH_SYNONYMS,
  TITLE_MATCH_SCORE,
} from "./constants.ts";
import operationsJson from "./operations.json" with { type: "json" };
import type { SearchableOperation } from "./types.ts";

// Parsed at startup so a malformed regeneration of operations.json fails loudly instead of at call time.
export const OPERATIONS: readonly Operation[] = z
  .array(operationSchema)
  .parse(operationsJson);

const OPERATIONS_BY_ID: ReadonlyMap<string, Operation> = new Map(
  OPERATIONS.map((operation) => [operation.id, operation]),
);

export function accessOf(operation: Operation): ToolAccess {
  return operation.method === "GET" ? "read" : "write";
}

export function findOperation(id: string): Operation {
  const operation = OPERATIONS_BY_ID.get(id.trim());
  if (!operation) {
    throw new UserFacingError(
      `No existe la operación "${id}". Usá search_api para ver los ids válidos, por ejemplo "GET /v3/balance/".`,
    );
  }
  return operation;
}

const DIACRITICS = /\p{Diacritic}/gu;

function normalize(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

function toSearchable(operation: Operation): SearchableOperation {
  const title = [operation.id, operation.summary, ...operation.tags].join(" ");
  return {
    operation,
    title: normalize(title),
    description: normalize(operation.description),
  };
}

const SEARCHABLE_OPERATIONS: readonly SearchableOperation[] =
  OPERATIONS.map(toSearchable);

function wordScore(
  word: string,
  { title, description }: SearchableOperation,
): number {
  const variants = [word, ...(SEARCH_SYNONYMS.get(word) ?? [])];
  if (variants.some((variant) => title.includes(variant))) {
    return TITLE_MATCH_SCORE;
  }
  if (variants.some((variant) => description.includes(variant))) {
    return DESCRIPTION_MATCH_SCORE;
  }
  return 0;
}

export function searchOperations(
  query: string,
  limit: number,
): readonly Operation[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return SEARCHABLE_OPERATIONS.map((searchable) => {
    const scores = words.map((word) => wordScore(word, searchable));
    const score = scores.reduce((total, each) => total + each, 0);
    return { operation: searchable.operation, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ operation }) => operation);
}

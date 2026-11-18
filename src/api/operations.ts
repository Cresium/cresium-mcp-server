import * as z from "zod";

import { isWrite } from "../cresium/operation.ts";
import { compileOperation } from "../cresium/request.ts";
import { operationSchema } from "../cresium/schema.ts";
import type { Operation } from "../cresium/types.ts";
import { UserFacingError } from "../errors.ts";
import type { ToolAccess } from "../tools/types.ts";
import {
  MIN_PLURAL_WORD_LENGTH,
  SEARCH_STOPWORDS,
  SEARCH_SYNONYMS,
  SUMMARY_MATCH_BONUS,
  TITLE_MATCH_SCORE,
} from "./constants.ts";
import operationsJson from "./operations.json" with { type: "json" };
import type { SearchableOperation } from "./types.ts";

// Parsed and compiled at startup so a malformed regeneration of operations.json fails loudly instead of at call time.
export const OPERATIONS: readonly Operation[] = z
  .array(operationSchema)
  .parse(operationsJson)
  .map(compileOperation);

const OPERATIONS_BY_ID: ReadonlyMap<string, Operation> = new Map(
  OPERATIONS.map((operation) => [operation.id, operation]),
);

export function accessOf(operation: Operation): ToolAccess {
  return isWrite(operation) ? "write" : "read";
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
    summary: normalize(operation.summary),
    description: normalize(operation.description),
  };
}

const SEARCHABLE_OPERATIONS: readonly SearchableOperation[] =
  OPERATIONS.map(toSearchable);

function withoutPlural(word: string): readonly string[] {
  if (word.length < MIN_PLURAL_WORD_LENGTH) return [];
  return [word.replace(/s$/, ""), word.replace(/es$/, "")].filter(
    (stem) => stem !== word,
  );
}

function variantsOf(word: string): readonly string[] {
  const forms = [word, ...withoutPlural(word)];
  return [
    ...forms,
    ...forms.flatMap((form) => SEARCH_SYNONYMS.get(form) ?? []),
  ];
}

/** How well one word matches an operation; 0 when it is nowhere, and a description alone never counts as a hit. */
function wordScore(
  variants: readonly string[],
  { title, summary }: SearchableOperation,
): number {
  if (!variants.some((variant) => title.includes(variant))) return 0;
  return variants.some((variant) => summary.includes(variant))
    ? TITLE_MATCH_SCORE + SUMMARY_MATCH_BONUS
    : TITLE_MATCH_SCORE;
}

export function searchOperations(
  query: string,
  limit: number,
): readonly Operation[] {
  const words = normalize(query)
    .split(/\s+/)
    .filter((word) => word !== "" && !SEARCH_STOPWORDS.has(word));
  const wordVariants = words.map(variantsOf);
  return SEARCHABLE_OPERATIONS.map((searchable) => {
    const scores = wordVariants.map((variants) =>
      wordScore(variants, searchable),
    );
    const score = scores.reduce((total, each) => total + each, 0);
    return { operation: searchable.operation, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ operation }) => operation);
}

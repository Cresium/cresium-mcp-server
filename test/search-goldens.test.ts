import { expect, it } from "bun:test";

import { OPERATIONS, searchOperations } from "../src/api/operations.ts";
import { SEARCH_GOLDENS } from "./search-goldens.ts";
import type { SearchGolden } from "./support/types.ts";

const TOP = 3;
const MIN_GOLDENS = 40;
const MIN_PER_TAG = 2;
const MIN_GUARDS = 5;

function failureOf(golden: SearchGolden): string | undefined {
  const ids = searchOperations(golden.phrase, TOP).map(({ id }) => id);
  const found = ids.length === 0 ? "no results" : ids.join(", ");
  if ("none" in golden) {
    return ids.length === 0
      ? undefined
      : `"${golden.phrase}" should find nothing, got: ${found}`;
  }
  if ("notFirst" in golden) {
    return ids[0] === golden.notFirst
      ? `"${golden.phrase}" must not put ${golden.notFirst} first`
      : undefined;
  }
  return ids.includes(golden.top3)
    ? undefined
    : `"${golden.phrase}" should find ${golden.top3} in the top ${TOP}, got: ${found}`;
}

it("finds the right operation for every golden phrase", () => {
  const failures = SEARCH_GOLDENS.flatMap((golden) => failureOf(golden) ?? []);
  expect(failures).toEqual([]);
});

it("names only operations that exist", () => {
  const known = new Set(OPERATIONS.map(({ id }) => id));
  for (const golden of SEARCH_GOLDENS) {
    if ("none" in golden) continue;
    const id = "top3" in golden ? golden.top3 : golden.notFirst;
    expect(known.has(id), `${golden.phrase}: ${id}`).toBe(true);
  }
});

it("is big enough, guards against over-matching and covers every tag twice", () => {
  expect(SEARCH_GOLDENS.length).toBeGreaterThanOrEqual(MIN_GOLDENS);
  const guards = SEARCH_GOLDENS.filter(
    (golden) => "none" in golden || "notFirst" in golden,
  );
  expect(guards.length).toBeGreaterThanOrEqual(MIN_GUARDS);
  const byId = new Map(
    OPERATIONS.map((operation) => [operation.id, operation]),
  );
  const counts = new Map<string, number>();
  for (const golden of SEARCH_GOLDENS) {
    if (!("top3" in golden)) continue;
    for (const tag of byId.get(golden.top3)?.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  for (const tag of new Set(OPERATIONS.flatMap(({ tags }) => tags))) {
    expect(counts.get(tag) ?? 0, tag).toBeGreaterThanOrEqual(MIN_PER_TAG);
  }
});

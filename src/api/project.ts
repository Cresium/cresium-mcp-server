import type { Projection } from "./types.ts";

type Fields = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Fields {
  return typeof value === "object" && !!value && !Array.isArray(value);
}

/** A value that may legitimately be 0, "" or false, so a match is boxed. */
interface Found {
  readonly value: unknown;
}

/** Only what `path` points at, keeping its place in the structure; nothing when `value` has no such path. Lists are walked element by element. */
function pick(value: unknown, path: readonly string[]): Found | undefined {
  const [head, ...rest] = path;
  if (head == null) return { value };
  if (Array.isArray(value)) {
    const picked = value.map((element: unknown) => pick(element, path));
    if (picked.every((found) => !found)) return;
    return { value: picked.map((found) => (found ? found.value : {})) };
  }
  if (!isRecord(value) || !Object.hasOwn(value, head)) return;
  const inner = pick(value[head], rest);
  return inner && { value: { [head]: inner.value } };
}

function merge(left: unknown, right: unknown): unknown {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.map((element: unknown, index) => merge(element, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return Object.fromEntries(
      [...keys].map((key) => [
        key,
        key in left && key in right
          ? merge(left[key], right[key])
          : (left[key] ?? right[key]),
      ]),
    );
  }
  return right;
}

/** The items a projection applies to, and how to put the projected ones back where they were. */
interface Collection {
  readonly items: readonly unknown[];
  readonly restore: (items: readonly unknown[]) => unknown;
}

function collectionOf(
  target: unknown,
  paths: readonly (readonly string[])[],
): Collection {
  if (Array.isArray(target)) {
    return { items: target, restore: (items) => items };
  }
  if (isRecord(target)) {
    const lists = Object.entries(target).filter(
      ([, value]) =>
        Array.isArray(value) &&
        value.every((element: unknown) => isRecord(element)),
    );
    const [only, ...others] = lists;
    const pointsAtTarget = paths.some((path) => pick(target, path));
    if (only && others.length === 0 && !pointsAtTarget) {
      const [key, items] = only;
      return {
        items: Array.isArray(items) ? items : [],
        restore: (projected) => ({ ...target, [key]: projected }),
      };
    }
  }
  return { items: [target], restore: ([item]) => item };
}

function projectTarget(
  target: unknown,
  paths: readonly (readonly string[])[],
): { readonly value: unknown; readonly matched: readonly boolean[] } {
  const { items, restore } = collectionOf(target, paths);
  // With no items there is nothing a path could have missed.
  const matched = paths.map(() => items.length === 0);
  const projected = items.map((item) => {
    if (!isRecord(item)) return item;
    let kept: unknown = {};
    paths.forEach((path, index) => {
      const found = pick(item, path);
      if (!found) return;
      matched[index] = true;
      kept = merge(kept, found.value);
    });
    return kept;
  });
  return { value: restore(projected), matched };
}

/**
 * Keeps only `fields` (dot paths) of each item of an answer. The items are the answer's `data` when it has
 * one, else the answer itself; a list is its items, and an object holding exactly one list of objects is
 * that list (so pagination fields stay) unless a path points at the object itself. Anything else is one item. Paths that match nothing are returned.
 */
export function projectFields(
  answer: unknown,
  fields: readonly string[],
): Projection {
  if (typeof answer === "string") return { value: answer, unmatched: [] };
  const paths = fields.map((field) => field.split("."));
  const enveloped = isRecord(answer) && Object.hasOwn(answer, "data");
  const { value, matched } = projectTarget(
    enveloped ? answer["data"] : answer,
    paths,
  );
  return {
    value: enveloped ? { ...answer, data: value } : value,
    unmatched: fields.filter((_field, index) => !matched[index]),
  };
}

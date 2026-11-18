// Regenerates src/api/operations.json from Cresium/bible's openapi.json.
// Usage: bun run spec:update [path/to/openapi.json]   (default: fetch bible's main branch with `gh`)
// mage's deploy workflow runs it after each production deploy and pushes the result to main,
// so it must run without installed dependencies (no `bun install`, no prettier).
import { $ } from "bun";

import { HTTP_METHODS } from "../src/api/constants.ts";
import type { HttpMethod, JsonSchema, Operation } from "../src/api/types.ts";

const OUTPUT_PATH = new URL("../src/api/operations.json", import.meta.url);
// The server runs remotely, so it cannot read files from the partner's disk to upload them.
const EXCLUDED_OPERATIONS: ReadonlySet<string> = new Set([
  "POST /v3/invoice/read",
]);
// Strips keys that only help humans render docs; they make the spec ~10x larger without telling an agent more.
const DOC_ONLY_KEYS: ReadonlySet<string> = new Set(["example", "examples"]);

interface OpenApiOperation {
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly parameters?: readonly {
    readonly name: string;
    readonly in: string;
    readonly required?: boolean;
    readonly description?: string;
    readonly schema?: unknown;
  }[];
  readonly requestBody?: {
    readonly content?: Record<string, { readonly schema?: unknown }>;
  };
}

interface OpenApiDocument {
  readonly paths: Record<string, Record<string, OpenApiOperation>>;
}

function stripDocOnlyKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDocOnlyKeys);
  if (value == null || typeof value !== "object") return value;
  const entries = Object.entries(value).filter(
    ([key]) => !DOC_ONLY_KEYS.has(key),
  );
  return Object.fromEntries(
    entries.map(([key, inner]) => [key, stripDocOnlyKeys(inner)]),
  );
}

async function readSpec(path: string | undefined): Promise<OpenApiDocument> {
  if (path) return (await Bun.file(path).json()) as OpenApiDocument;
  const raw =
    await $`gh api repos/Cresium/bible/contents/openapi.json -H "Accept: application/vnd.github.raw"`.text();
  return JSON.parse(raw) as OpenApiDocument;
}

function toJsonSchema(value: unknown): JsonSchema | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function toOperation(
  method: HttpMethod,
  path: string,
  op: OpenApiOperation,
): Operation {
  const id = `${method} ${path}`;
  const content = op.requestBody?.content;
  const jsonBody = content?.["application/json"];
  if (content && !jsonBody) {
    throw new Error(
      `${id} takes a non-JSON body; add it to EXCLUDED_OPERATIONS or teach the client to send it.`,
    );
  }
  return {
    id,
    method,
    path,
    summary: op.summary ?? "",
    description: op.description ?? "",
    tags: op.tags ?? [],
    parameters: (op.parameters ?? [])
      .filter((p) => p.in === "path" || p.in === "query")
      .map((p) => ({
        name: p.name,
        in: p.in as "path" | "query",
        required: p.required ?? p.in === "path",
        description: p.description ?? "",
        schema: stripDocOnlyKeys(p.schema ?? {}),
      })),
    body: toJsonSchema(stripDocOnlyKeys(jsonBody?.schema)),
  };
}

const spec = await readSpec(process.argv[2]);
const operations = Object.entries(spec.paths)
  .flatMap(([path, methods]) =>
    HTTP_METHODS.flatMap((method) => {
      const op = methods[method.toLowerCase()];
      return op ? [toOperation(method, path, op)] : [];
    }),
  )
  .filter((operation) => !EXCLUDED_OPERATIONS.has(operation.id));

await Bun.write(OUTPUT_PATH, `${JSON.stringify(operations, null, 2)}\n`);
console.log(`wrote ${operations.length} operations to ${OUTPUT_PATH.pathname}`);

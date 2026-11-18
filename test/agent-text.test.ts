import { Glob } from "bun";
import { describe, expect, it } from "bun:test";

import { findOperation, OPERATIONS } from "../src/api/operations.ts";
import { API_TOOLS } from "../src/api/tools.ts";
import { previewRequest } from "../src/cresium/client.ts";
import { toCresiumRequest } from "../src/cresium/request.ts";
import { MINTLIFY_TOOLS } from "../src/docs/constants.ts";
import { createDocsTools } from "../src/docs/tools.ts";
import { PROMPTS } from "../src/mcp/constants.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const TOOL_NAME = /\b[a-z]+(?:_[a-z]+)+\b/g;
const OPERATION_ID = /\b(?:GET|POST|PUT|PATCH|DELETE) \/v3\/[\w/{}-]*[\w/}]/g;
// Snake_case words in the code that name neither a tool nor a prompt: JSON error codes of the HTTP endpoint.
const NOT_TOOL_NAMES = [
  "missing_credentials",
  "batch_not_supported",
  "internal_error",
];

const productionSources = await Promise.all(
  [...new Glob("**/*.ts").scanSync({ cwd: SRC })]
    .filter((path) => !path.endsWith(".test.ts"))
    .map(async (path) => ({
      path,
      text: await Bun.file(`${SRC}${path}`).text(),
    })),
);

const knownNames = new Set<string>([
  ...API_TOOLS.map(({ name }) => name),
  ...createDocsTools("http://localhost").map(({ name }) => name),
  ...PROMPTS.map(({ name }) => name),
  ...Object.values(MINTLIFY_TOOLS),
  ...NOT_TOOL_NAMES,
]);
const knownOperations = new Set(OPERATIONS.map(({ id }) => id));

describe("names mentioned in agent-facing text", () => {
  it("includes the tools and prompts the server really has", () => {
    for (const name of ["check_connection", "read_api", "search_docs"]) {
      expect(knownNames.has(name)).toBe(true);
    }
    expect(productionSources.length).toBeGreaterThan(10);
  });

  it("names only tools and prompts that exist", () => {
    for (const { path, text } of productionSources) {
      for (const name of text.match(TOOL_NAME) ?? []) {
        expect(
          knownNames.has(name),
          `src/${path} mentions ${name}, which is no tool or prompt`,
        ).toBe(true);
      }
    }
  });

  it("names only operations that exist in the bundled catalogue", () => {
    for (const { path, text } of productionSources) {
      for (const id of text.match(OPERATION_ID) ?? []) {
        expect(
          knownOperations.has(id),
          `src/${path} mentions ${id}, which is no bundled operation`,
        ).toBe(true);
      }
    }
  });
});

it("the signature prompt uses the same encoded list query as signedText", () => {
  const request = toCresiumRequest(
    findOperation("GET /v3/transaction/search"),
    {
      pathParams: {},
      query: { types: ["DEPOSIT"] },
    },
  );
  const preview = previewRequest("http://localhost", request);
  const example = "types%5B%5D=DEPOSIT";
  expect(preview.signedText).toContain(example);
  expect(PROMPTS.find(({ name }) => name === "depurar_firma")?.text).toContain(
    example,
  );
});

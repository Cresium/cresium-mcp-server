import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url);
const CATALOGUE = new URL("../src/api/operations.json", import.meta.url);
const catalogue = await Bun.file(CATALOGUE).text();

function specWith(operation: Record<string, unknown>): unknown {
  return { paths: { "/v3/thing/{id}": { post: operation } } };
}

const REF = { $ref: "#/components/schemas/Thing" };

let directory = "";

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function generate(
  spec: unknown,
): Promise<{ code: number; stderr: string }> {
  directory = await mkdtemp(join(tmpdir(), "generate-spec-"));
  for (const relative of [
    "scripts/generate-spec.ts",
    "src/cresium/constants.ts",
    "src/partner/constants.ts",
  ]) {
    await Bun.write(
      join(directory, relative),
      Bun.file(new URL(relative, ROOT)),
    );
  }
  await mkdir(join(directory, "src/api"), { recursive: true });
  await Bun.write(join(directory, "src/api/operations.json"), catalogue);
  const path = join(directory, "openapi.json");
  await Bun.write(path, JSON.stringify(spec));
  const run = Bun.spawnSync(
    ["bun", "--no-install", join(directory, "scripts/generate-spec.ts"), path],
    { stderr: "pipe" },
  );
  return { code: run.exitCode, stderr: run.stderr.toString() };
}

describe("scripts/generate-spec.ts", () => {
  it("generates the catalogue without installed dependencies, excludes uploads and auth headers", async () => {
    const { code, stderr } = await generate({
      paths: {
        "/v3/invoice/read": {
          post: {
            requestBody: {
              content: {
                "multipart/form-data": { schema: { type: "object" } },
              },
            },
          },
        },
        "/v3/thing/{id}": {
          get: {
            parameters: [
              { name: "id", in: "path", schema: { type: "string" } },
              { name: "x-api-key", in: "header", schema: { type: "string" } },
            ],
          },
        },
      },
    });
    expect(code, stderr).toBe(0);
    const output: unknown = await Bun.file(
      join(directory, "src/api/operations.json"),
    ).json();
    expect(output).toEqual([
      {
        id: "GET /v3/thing/{id}",
        method: "GET",
        path: "/v3/thing/{id}",
        summary: "",
        description: "",
        tags: [],
        body: null,
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "",
            schema: { type: "string" },
          },
        ],
      },
    ]);
  });

  it.each([
    [
      "body",
      specWith({
        requestBody: { content: { "application/json": { schema: REF } } },
      }),
    ],
    [
      "parameter",
      specWith({ parameters: [{ name: "id", in: "path", schema: REF }] }),
    ],
  ])(
    "refuses a %s schema with a $ref, naming the operation",
    async (_where, spec) => {
      const { code, stderr } = await generate(spec);
      expect(code).not.toBe(0);
      expect(stderr).toContain("POST /v3/thing/{id}");
      expect(stderr).toContain("$ref");
      expect(
        await Bun.file(join(directory, "src/api/operations.json")).text(),
      ).toBe(catalogue);
    },
  );
});

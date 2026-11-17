import { describe, expect, it } from "bun:test";

import { UNKNOWN_WRITE_OUTCOME } from "../tools/constants.ts";
import { ToolError } from "../tools/errors.ts";
import { findOperation, OPERATIONS, searchOperations } from "./operations.ts";

describe("bundled operations", () => {
  it("has unique ids that match each operation's method and path", () => {
    const ids = OPERATIONS.map((operation) => operation.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const operation of OPERATIONS) {
      expect(operation.id).toBe(`${operation.method} ${operation.path}`);
    }
  });

  it("leaves out the file upload a remote server cannot perform", () => {
    expect(OPERATIONS.map((operation) => operation.id)).not.toContain(
      "POST /v3/invoice/read",
    );
  });

  it("never asks the agent for auth headers: the server adds them", () => {
    const names = OPERATIONS.flatMap((operation) =>
      operation.parameters.map((param) => param.name.toLowerCase()),
    );
    expect(names.filter((name) => name.startsWith("x-"))).toEqual([]);
  });

  it("declares every path placeholder as a path parameter", () => {
    for (const operation of OPERATIONS) {
      const placeholders = [...operation.path.matchAll(/\{(\w+)\}/g)].map(
        ([, name]) => name ?? "",
      );
      const pathParams = operation.parameters
        .filter((param) => param.in === "path")
        .map((param) => param.name);
      expect(pathParams.sort()).toEqual(placeholders.sort());
    }
  });
});

describe("searchOperations", () => {
  it("puts the operation matching most words first", () => {
    const [first] = searchOperations("emitir cvu dedicado", 3);
    expect(first?.id).toBe("POST /v3/deposit-address/cvu");
  });

  it("lists every operation for an empty query", () => {
    expect(searchOperations("  ", 5)).toHaveLength(OPERATIONS.length);
  });

  it("returns nothing when no word matches", () => {
    expect(searchOperations("zzzz", 5)).toEqual([]);
  });
});

describe("findOperation", () => {
  it("finds the operation the write-timeout advice tells agents to read", () => {
    expect(UNKNOWN_WRITE_OUTCOME).toContain("GET /v3/transaction/search");
    expect(findOperation("GET /v3/transaction/search").method).toBe("GET");
  });

  it("throws a ToolError that points to search_api for an unknown id", () => {
    expect(() => findOperation("GET /v3/nope")).toThrow(ToolError);
    expect(() => findOperation("GET /v3/nope")).toThrow(/search_api/);
  });
});

import { describe, expect, it } from "bun:test";

import { UserFacingError } from "../errors.ts";
import { PROMPTS, SERVER_INSTRUCTIONS } from "../mcp/constants.ts";
import {
  API_WRITE_UNKNOWN_OUTCOME,
  CONNECTION_CHECK_OPERATION,
} from "./constants.ts";
import { findOperation, OPERATIONS, searchOperations } from "./operations.ts";

const OPERATION_REFERENCE =
  /\b(?:GET|POST|PUT|PATCH|DELETE) \/v3\/[\w/{}-]*[\w/}]/g;

function operationReferences(text: string): string[] {
  return text.match(OPERATION_REFERENCE) ?? [];
}

function unknownExample(): string {
  try {
    findOperation("unknown");
  } catch (error) {
    return error instanceof Error ? error.message : "";
  }
  return "";
}

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

  it("ignores accents and case", () => {
    const accented = searchOperations("Transacción", 8);
    expect(accented).toEqual(searchOperations("transaccion", 8));
    expect(accented.map((operation) => operation.id)).toContain(
      "GET /v3/transaction/search",
    );
  });

  it("ranks a match in the id, summary or tags above one in the description", () => {
    const ids = searchOperations("transaccion", 6).map(
      (operation) => operation.id,
    );
    expect(ids.every((id) => id.includes("/v3/transaction/"))).toBe(true);
  });

  it.each([
    ["refund", "POST /v3/transaction/reverse"],
    ["devolución", "POST /v3/transaction/reverse"],
    ["transferir plata", "POST /v3/transaction/preview"],
  ])("finds %s through its synonym", (query, expected) => {
    const [first] = searchOperations(query, 3);
    expect(first?.id).toBe(expected);
  });

  it("finds the wallets operation through the synonym for billeteras", () => {
    const ids = searchOperations("billeteras", 5).map(({ id }) => id);
    expect(ids).toContain("GET /v3/balance/wallets");
  });

  it("matches nothing for a blank query", () => {
    expect(searchOperations("  ", 5)).toEqual([]);
  });

  it("returns nothing when no word matches", () => {
    expect(searchOperations("zzzz", 5)).toEqual([]);
  });
});

describe("findOperation", () => {
  it("throws a UserFacingError that points to search_api for an unknown id", () => {
    expect(() => findOperation("GET /v3/nope")).toThrow(UserFacingError);
    expect(() => findOperation("GET /v3/nope")).toThrow(/search_api/);
  });
});

describe("operation ids named in agent-facing text", () => {
  it("all exist in the bundled operations", () => {
    const sources = {
      SERVER_INSTRUCTIONS,
      PROMPTS: PROMPTS.map(({ text }) => text).join("\n"),
      API_WRITE_UNKNOWN_OUTCOME,
      CONNECTION_CHECK_OPERATION,
      "unknown id error": unknownExample(),
    };
    const known = new Set(OPERATIONS.map((operation) => operation.id));
    for (const [source, text] of Object.entries(sources)) {
      const references = operationReferences(text);
      expect(references.length, `${source} names no operation`).toBeGreaterThan(
        0,
      );
      for (const id of references) {
        expect(
          known.has(id),
          `${source} names ${id}, which does not exist`,
        ).toBe(true);
      }
    }
  });
});

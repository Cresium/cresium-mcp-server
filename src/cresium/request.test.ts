import { describe, expect, it } from "bun:test";

import { findOperation } from "../api/operations.ts";
import { ToolError } from "../tools/errors.ts";
import { toCresiumRequest } from "./request.ts";

const NO_PARAMS = { pathParams: {}, query: {} };

describe("toCresiumRequest", () => {
  describe("url", () => {
    it("fills and encodes path parameters", () => {
      const request = toCresiumRequest(
        findOperation("GET /v3/bank-address/{value}"),
        { ...NO_PARAMS, pathParams: { value: "mi alias/1" } },
      );
      expect(request.url).toBe("/v3/bank-address/mi%20alias%2F1");
    });

    it("sends arrays as repeated name[] keys", () => {
      const request = toCresiumRequest(
        findOperation("GET /v3/transaction/search"),
        {
          ...NO_PARAMS,
          query: { types: ["DEPOSIT", "WITHDRAWAL"], pageSize: 2 },
        },
      );
      expect(request.url).toBe(
        "/v3/transaction/search?types%5B%5D=DEPOSIT&types%5B%5D=WITHDRAWAL&pageSize=2",
      );
    });

    it("accepts 0 as a path parameter value", () => {
      const request = toCresiumRequest(
        findOperation("GET /v3/transaction/{id}"),
        { ...NO_PARAMS, pathParams: { id: 0 } },
      );
      expect(request.url).toBe("/v3/transaction/0");
    });

    it("rejects missing required and unknown parameters together", () => {
      const build = (): unknown =>
        toCresiumRequest(findOperation("GET /v3/transaction/{id}"), {
          pathParams: {},
          query: { page: 1 },
        });
      expect(build).toThrow(
        "Parámetros inválidos para GET /v3/transaction/{id}: faltan path:id; no existen query:page.",
      );
    });

    it.each(["", ".", ".."])("rejects %p as a path value", (value) => {
      const build = (): unknown =>
        toCresiumRequest(findOperation("GET /v3/transaction/{id}"), {
          ...NO_PARAMS,
          pathParams: { id: value },
        });
      expect(build).toThrow(ToolError);
    });
  });

  describe("body", () => {
    const deposit = findOperation("POST /v3/sandbox/deposit");

    it("coerces types the way mage's validation will before it checks the signature", () => {
      const request = toCresiumRequest(deposit, {
        ...NO_PARAMS,
        body: { cvu: "000", amount: "1500" },
      });
      expect(request.body).toEqual({ cvu: "000", amount: 1500 });
    });

    it("leaves the caller's object untouched", () => {
      const body = { cvu: "000", amount: "1500" };
      toCresiumRequest(deposit, { ...NO_PARAMS, body });
      expect(body.amount).toBe("1500");
    });

    it("rejects a body that mage's schema would reject", () => {
      const build = (): unknown =>
        toCresiumRequest(deposit, { ...NO_PARAMS, body: { cvu: "000" } });
      expect(build).toThrow(/amount/);
    });

    it("rejects a body on an operation that takes none", () => {
      const build = (): unknown =>
        toCresiumRequest(findOperation("GET /v3/balance/wallets"), {
          ...NO_PARAMS,
          body: { x: 1 },
        });
      expect(build).toThrow("GET /v3/balance/wallets no recibe body.");
    });
  });
});

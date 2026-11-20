import { describe, expect, it } from "bun:test";

import { sampleBody } from "../../test/support/sample-body.ts";
import { findOperation, OPERATIONS } from "../api/operations.ts";
import { UserFacingError } from "../errors.ts";
import { compileOperation, toCresiumRequest } from "./request.ts";

const NO_PARAMS = { pathParams: {}, query: {} };

describe("compileOperation", () => {
  it("refuses a body schema the validator cannot compile, naming the operation", () => {
    const unresolved = {
      ...findOperation("POST /v3/sandbox/deposit"),
      body: { $ref: "#/components/schemas/Deposit" },
    };
    expect(() => compileOperation(unresolved)).toThrow(
      /^Cannot compile the body schema of POST \/v3\/sandbox\/deposit: /,
    );
  });
});

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

    it.each(["", ".", "..", "\uD800"])(
      "rejects %p as a path value",
      (value) => {
        const build = (): unknown =>
          toCresiumRequest(findOperation("GET /v3/transaction/{id}"), {
            ...NO_PARAMS,
            pathParams: { id: value },
          });
        expect(build).toThrow(UserFacingError);
      },
    );
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

    it("rejects a field the API does not know, naming the valid ones", () => {
      const build = (): unknown =>
        toCresiumRequest(deposit, {
          ...NO_PARAMS,
          body: { cvu: "000", amount: 1500, ammount: 1 },
        });
      expect(build).toThrow(UserFacingError);
      expect(build).toThrow(/no conoce ammount\. Campos válidos: .*amount/);
    });

    it("accepts free-form keys inside a field whose schema allows them", () => {
      const request = toCresiumRequest(
        findOperation("POST /v3/payment-order/"),
        {
          ...NO_PARAMS,
          body: {
            alias: "cobro.pedido",
            paymentOrder: {
              externalId: "orden-1",
              amount: 100,
              metadata: { pedido: "A-1" },
            },
          },
        },
      );
      expect(request.body).toMatchObject({
        paymentOrder: { metadata: { pedido: "A-1" } },
      });
    });

    it("rejects an unknown field inside a nested object, by path, naming the valid fields there", () => {
      const build = (): unknown =>
        toCresiumRequest(findOperation("POST /v3/payment-order/"), {
          ...NO_PARAMS,
          body: {
            alias: "cobro.pedido",
            paymentOrder: {
              externalId: "orden-1",
              amount: 100,
              expiresin: "1h",
            },
          },
        });
      expect(build).toThrow(
        "Body inválido para POST /v3/payment-order/: la API no conoce paymentOrder.expiresin. Campos válidos en paymentOrder: externalId, amount, title, description, metadata, expiresIn.",
      );
    });

    it("rejects an unknown field in an item of a list body, naming each level", () => {
      const invoice = {
        amount: 100,
        payerNationalIdentifier: "20123456789",
        payerName: "Ana",
        status: "DRAFT",
      };
      const build = (): unknown =>
        toCresiumRequest(findOperation("POST /v3/invoice/"), {
          ...NO_PARAMS,
          body: [invoice, { ...invoice, descripcion: "x", extra: 1 }],
        });
      expect(build).toThrow(
        "Body inválido para POST /v3/invoice/: la API no conoce [1].descripcion, [1].extra. Campos válidos en [1]: amount, description, internalNote, payerInternalNote, payerNationalIdentifier, payerName, expiresAt, issuedAt, payerEmail, externalId, fileKey, status.",
      );
    });

    it("reports unknown fields at several levels in one message", () => {
      const build = (): unknown =>
        toCresiumRequest(findOperation("POST /v3/payment-order/"), {
          ...NO_PARAMS,
          body: {
            alias: "cobro.pedido",
            aliass: "x",
            paymentOrder: { externalId: "orden-1", amount: 100, titulo: "t" },
          },
        });
      expect(build).toThrow(
        "Body inválido para POST /v3/payment-order/: la API no conoce aliass. Campos válidos: alias, paymentOrder. Tampoco conoce paymentOrder.titulo. Campos válidos en paymentOrder: externalId, amount, title, description, metadata, expiresIn.",
      );
    });

    it("sees an unknown field even where the validator would strip it before sending", () => {
      const closed = compileOperation({
        ...deposit,
        body: {
          type: "object",
          properties: { cvu: { type: "string" } },
          additionalProperties: false,
        },
      });
      const build = (): unknown =>
        toCresiumRequest(closed, {
          ...NO_PARAMS,
          body: { cvu: "1", cvv: "2" },
        });
      expect(build).toThrow(/no conoce cvv\. Campos válidos: cvu\./);
    });

    it("accepts any key under a schema that explicitly allows additional properties", () => {
      const open = compileOperation({
        ...deposit,
        body: {
          type: "object",
          properties: { cvu: { type: "string" } },
          additionalProperties: true,
        },
      });
      const request = toCresiumRequest(open, {
        ...NO_PARAMS,
        body: { cvu: "1", libre: "2" },
      });
      expect(request.body).toEqual({ cvu: "1", libre: "2" });
    });

    describe("with anyOf branches", () => {
      const byDestination = compileOperation({
        ...deposit,
        body: {
          anyOf: [
            {
              type: "object",
              properties: {
                destination: {
                  type: "object",
                  properties: { cvu: { type: "string" } },
                },
              },
            },
            {
              type: "object",
              properties: {
                destination: {
                  type: "object",
                  properties: { alias: { type: "string" } },
                },
              },
            },
          ],
        },
      });
      const listOfEither = compileOperation({
        ...deposit,
        body: {
          anyOf: [
            {
              type: "array",
              items: {
                type: "object",
                properties: { cvu: { type: "string" } },
              },
            },
            {
              type: "array",
              items: {
                type: "object",
                properties: { alias: { type: "string" } },
              },
            },
          ],
        },
      });

      it("accepts a field that only the first branch declaring its parent knows", () => {
        const request = toCresiumRequest(byDestination, {
          ...NO_PARAMS,
          body: { destination: { cvu: "1" } },
        });
        expect(request.body).toEqual({ destination: { cvu: "1" } });
      });

      it("accepts a list item that only one branch's items know", () => {
        const request = toCresiumRequest(listOfEither, {
          ...NO_PARAMS,
          body: [{ cvu: "1" }],
        });
        expect(request.body).toEqual([{ cvu: "1" }]);
      });

      it("still rejects a field every branch rejects, naming the fields any branch knows", () => {
        const build = (): unknown =>
          toCresiumRequest(byDestination, {
            ...NO_PARAMS,
            body: { destination: { cvu: "1", cvv: "2" } },
          });
        expect(build).toThrow(
          `Body inválido para ${deposit.id}: la API no conoce destination.cvv. Campos válidos en destination: cvu, alias.`,
        );
      });
    });

    it.each(OPERATIONS.filter(({ body }) => body != null).map(({ id }) => id))(
      "accepts a body for %s built from every field of its own schema",
      (id) => {
        const operation = findOperation(id);
        const call = {
          pathParams: Object.fromEntries(
            operation.parameters
              .filter((param) => param.in === "path")
              .map((param) => [param.name, "1"]),
          ),
          query: {},
          body: sampleBody(operation.body ?? {}),
        };
        expect(() => toCresiumRequest(operation, call)).not.toThrow();
      },
    );

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

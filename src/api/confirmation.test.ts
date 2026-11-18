import { describe, expect, it } from "bun:test";

import type { CresiumDryRun } from "../cresium/types.ts";
import { UserFacingError } from "../errors.ts";
import { confirmationFor } from "./confirmation.ts";
import { CONFIRMATION_SHOWN_CHARS } from "./constants.ts";

const PREVIEW: CresiumDryRun = {
  dryRun: true,
  environment: "production",
  method: "POST",
  url: "https://api.cresium.app/v3/deposit-address/cvu",
  body: { value: "x" },
  signedText: "ignored",
  note: "ignored",
};

describe("confirmationFor", () => {
  it("shows the environment, the method, the url and the body as they go out", () => {
    const { message } = confirmationFor(
      "POST /v3/deposit-address/cvu",
      PREVIEW,
    );
    expect(message).toContain("PRODUCCIÓN");
    expect(message).toContain("Método: POST");
    expect(message).toContain(
      "URL: https://api.cresium.app/v3/deposit-address/cvu",
    );
    expect(message).toContain('Body: {"value":"x"}');
  });

  it("says when there is no body", () => {
    const { message } = confirmationFor("DELETE /v3/x/{id}", {
      ...PREVIEW,
      method: "DELETE",
      body: null,
    });
    expect(message).toContain("Body: (sin body)");
  });

  it("cuts a long body and says how long it was", () => {
    const { message } = confirmationFor("POST /v3/deposit-address/cvu", {
      ...PREVIEW,
      body: { value: "a".repeat(CONFIRMATION_SHOWN_CHARS * 4) },
    });
    expect(message.length).toBeLessThan(CONFIRMATION_SHOWN_CHARS * 2);
    expect(message).toContain(`de ${CONFIRMATION_SHOWN_CHARS * 4} caracteres`);
  });

  it("never lets a long text put the amount or the destination out of view", () => {
    // What repro1 did: a description first, long enough to push what follows past any cut of the whole body.
    const { message } = confirmationFor("POST /v3/transaction/preview", {
      ...PREVIEW,
      url: "https://api.cresium.app/v3/transaction/preview",
      body: {
        description: "Pago de honorarios mensuales según contrato. ".repeat(40),
        toId: 777001,
        amount: "9999999",
        currencyCode: "ARS",
      },
    });
    expect(message).toContain('"toId":777001');
    expect(message).toContain('"amount":"9999999"');
    expect(message).toContain('"currencyCode":"ARS"');
    expect(message).toContain('"description":"Pago de honorarios');
    expect(message).toContain("de 1800 caracteres");
  });

  it("shortens long texts inside nested objects and list items, keeping every key and value around them", () => {
    const long = "x".repeat(5_000);
    const nested = confirmationFor("POST /v3/payment-order/", {
      ...PREVIEW,
      body: {
        paymentOrder: { description: long, amount: 5, expiresIn: 60 },
        alias: "cobro.uno",
      },
    }).message;
    expect(nested).toContain('"amount":5,"expiresIn":60}');
    expect(nested).toContain('"alias":"cobro.uno"');
    expect(nested).toContain("de 5000 caracteres");

    const listed = confirmationFor("POST /v3/invoice/", {
      ...PREVIEW,
      body: [
        { description: long, amount: 1, payerName: "Ana", paid: false },
        { description: long, amount: 2, payerName: "Luis", tags: [long, 7] },
      ],
    }).message;
    for (const visible of [
      '"amount":1,"payerName":"Ana","paid":false}',
      '"amount":2,"payerName":"Luis","tags":["',
      'caracteres]",7]}]',
    ]) {
      expect(listed).toContain(visible);
    }
    expect(listed).not.toContain(long);
  });

  it("refuses to ask about a call too large to show, saying nothing was sent", () => {
    const body = Array.from({ length: 5_000 }, (_, index) => ({
      amount: index,
      payerName: "Ana",
    }));
    let refusal: unknown;
    try {
      confirmationFor("POST /v3/invoice/", { ...PREVIEW, body });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(UserFacingError);
    if (!(refusal instanceof UserFacingError)) return;
    expect(refusal.message).toContain("demasiado grande");
    expect(refusal.message).toContain("no se envió nada");
    expect(refusal.outcomeUnknown).toBe(false);
  });

  it("tells the person that a write without body acts on data the message cannot show", () => {
    const { message } = confirmationFor("PUT /v3/transaction/confirm/{id}", {
      ...PREVIEW,
      method: "PUT",
      url: "https://api.cresium.app/v3/transaction/confirm/98765",
      body: null,
    });
    expect(message).toContain("Body: (sin body)");
    expect(message).toContain("no lleva body");
    expect(message).toContain("el monto y el destino");
    const withBody = confirmationFor("POST /v3/deposit-address/cvu", PREVIEW);
    expect(withBody.message).not.toContain("no lleva body");
  });

  it("binds the full body, not the shortened one it shows", () => {
    const body = { value: "a".repeat(5_000), other: "b" };
    const shown = confirmationFor("POST /v3/deposit-address/cvu", {
      ...PREVIEW,
      body,
    });
    const changedTail = confirmationFor("POST /v3/deposit-address/cvu", {
      ...PREVIEW,
      body: { ...body, value: `${"a".repeat(4_999)}z` },
    });
    expect(changedTail.message).toBe(shown.message);
    expect(changedTail.effect).not.toBe(shown.effect);
  });

  it("binds a call to its operation, method, url and body, and to nothing else", () => {
    const base = confirmationFor("POST /v3/deposit-address/cvu", PREVIEW);
    expect(
      confirmationFor("POST /v3/deposit-address/cvu", PREVIEW).effect,
    ).toBe(base.effect);
    for (const other of [
      { ...PREVIEW, body: { value: "y" } },
      { ...PREVIEW, url: `${PREVIEW.url}?a=1` },
      { ...PREVIEW, method: "PUT" as const },
    ]) {
      expect(
        confirmationFor("POST /v3/deposit-address/cvu", other).effect,
      ).not.toBe(base.effect);
    }
    expect(confirmationFor("PUT /v3/other", PREVIEW).effect).not.toBe(
      base.effect,
    );
  });
});

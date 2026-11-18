import { describe, expect, it } from "bun:test";

import type { CresiumDryRun } from "../cresium/types.ts";
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
    expect(message).toContain(
      `de ${CONFIRMATION_SHOWN_CHARS * 4 + 12} caracteres`,
    );
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

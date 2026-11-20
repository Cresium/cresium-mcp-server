import { describe, expect, it } from "bun:test";

import { maskApiKey, readCredentials } from "./credentials.ts";

describe("readCredentials", () => {
  it("reads and trims the three headers", () => {
    const headers = new Headers({
      "x-api-key": " key ",
      "x-api-secret": "secret",
      "x-company-id": "44",
    });
    expect(readCredentials(headers)).toEqual({
      ok: true,
      credentials: { apiKey: "key", secret: "secret", companyId: "44" },
    });
  });

  it("lists every missing header", () => {
    const result = readCredentials(new Headers({ "x-api-key": "key" }));
    expect(result).toEqual({
      ok: false,
      problems: [
        "falta el header x-api-secret",
        "falta el header x-company-id",
      ],
    });
  });

  it("rejects a company id that is not a number", () => {
    const headers = new Headers({
      "x-api-key": "key",
      "x-api-secret": "secret",
      "x-company-id": "44; drop",
    });
    expect(readCredentials(headers)).toEqual({
      ok: false,
      problems: ["x-company-id tiene que ser un número"],
    });
  });
});

describe("maskApiKey", () => {
  it("keeps only the last four characters", () => {
    expect(maskApiKey("0123456789abcdef0123456789abc017")).toBe("****c017");
  });
});

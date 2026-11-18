import { describe, expect, it } from "bun:test";

import { MAX_RESULT_CHARS } from "./constants.ts";
import { limitText } from "./limit.ts";

const ADVICE = "Acotá con pageSize.";

describe("limitText", () => {
  it.each([0, 1, MAX_RESULT_CHARS - 1, MAX_RESULT_CHARS])(
    "leaves a text of %d characters as it is",
    (length) => {
      const text = "a".repeat(length);
      expect(limitText(text, ADVICE)).toBe(text);
    },
  );

  it("cuts at the limit and says how many characters were dropped", () => {
    const text = `${"a".repeat(MAX_RESULT_CHARS)}${"b".repeat(1234)}`;
    const limited = limitText(text, ADVICE);
    expect(limited.startsWith("a".repeat(MAX_RESULT_CHARS))).toBe(true);
    expect(limited).not.toContain("b");
    expect(limited).toContain("1234");
    expect(limited).toContain(String(text.length));
    expect(limited).toContain(ADVICE);
    expect(limited.length).toBeLessThan(MAX_RESULT_CHARS + 500);
  });

  it("says a cut JSON is no longer valid JSON", () => {
    const json = JSON.stringify({ items: "x".repeat(MAX_RESULT_CHARS) });
    const limited = limitText(json, ADVICE);
    expect(() => JSON.parse(limited) as unknown).toThrow();
    expect(limited).toContain("ya no es JSON válido");
  });

  it("does not leave half of a surrogate pair at the cut", () => {
    const text = `${"a".repeat(MAX_RESULT_CHARS - 1)}😀😀`;
    const [kept] = limitText(text, ADVICE).split("\n\n");
    expect(kept?.isWellFormed()).toBe(true);
    expect(kept).toBe("a".repeat(MAX_RESULT_CHARS - 1));
  });
});

import { describe, expect, it } from "bun:test";

import {
  DOCS_SEARCH_MAX_RESULTS,
  DOCS_SEARCH_RESULT_MAX_CHARS,
} from "./constants.ts";
import { formatDocsSearch } from "./search.ts";

function result(page: string, contentLength = 20): string {
  return `Title: ${page}\nLink: https://docs.cresium.com/${page}\nPage: ${page}\nContent: ${"x".repeat(contentLength)}`;
}

describe("formatDocsSearch", () => {
  it("returns a few short results joined, with no note", () => {
    const blocks = [result("sandbox"), result("webhooks")];
    expect(formatDocsSearch(blocks)).toBe(blocks.join("\n\n"));
  });

  it("cuts a long result and names the page to read in full", () => {
    const long = result("sandbox", 20_000);
    const text = formatDocsSearch([long]);
    expect(text.startsWith(long.slice(0, DOCS_SEARCH_RESULT_MAX_CHARS))).toBe(
      true,
    );
    expect(text).toContain(
      '[Recortado. Para leer la página completa: read_doc_page con path "sandbox".]',
    );
    expect(text.length).toBeLessThan(DOCS_SEARCH_RESULT_MAX_CHARS + 200);
  });

  it("cuts a long result that has no Page line without naming a page", () => {
    const text = formatDocsSearch([`Title: Suelto\n${"x".repeat(5_000)}`]);
    expect(text.endsWith("\n[Recortado.]")).toBe(true);
    expect(text).not.toContain("read_doc_page con path");
  });

  it("keeps the first results and says how many were dropped", () => {
    const pages = Array.from({ length: 10 }, (_, i) => `page-${i}`);
    const text = formatDocsSearch(pages.map((page) => result(page)));
    expect(DOCS_SEARCH_MAX_RESULTS).toBe(5);
    expect(text).toContain("Page: page-4");
    expect(text).not.toContain("Page: page-5");
    expect(
      text.endsWith(
        "Se muestran 5 de 10 resultados. Afiná la búsqueda o leé una página con read_doc_page.",
      ),
    ).toBe(true);
  });
});

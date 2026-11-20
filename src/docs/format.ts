import {
  BLOCK_SEPARATOR,
  DOCS_SEARCH_MAX_RESULTS,
  DOCS_SEARCH_PAGE_LINE,
  DOCS_SEARCH_RESULT_MAX_CHARS,
} from "./constants.ts";

function shorten(block: string): string {
  if (block.length <= DOCS_SEARCH_RESULT_MAX_CHARS) return block;
  const page = DOCS_SEARCH_PAGE_LINE.exec(block)?.[1]?.trim();
  const note =
    page == null
      ? "[Recortado.]"
      : `[Recortado. Para leer la página completa: read_doc_page con path "${page}".]`;
  return `${block.slice(0, DOCS_SEARCH_RESULT_MAX_CHARS)}\n${note}`;
}

export function formatDocsSearch(blocks: readonly string[]): string {
  const kept = blocks.slice(0, DOCS_SEARCH_MAX_RESULTS).map(shorten);
  if (kept.length === blocks.length) return kept.join(BLOCK_SEPARATOR);
  const count = `Se muestran ${kept.length} de ${blocks.length} resultados. Afiná la búsqueda o leé una página con read_doc_page.`;
  return [...kept, count].join(BLOCK_SEPARATOR);
}

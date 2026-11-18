import { BYTES_PER_MIB, MAX_UPSTREAM_BODY_BYTES } from "../constants.ts";

/** Tool names exposed by Mintlify's MCP at `<docs>/mcp`. test/mintlify.test.ts fails if Mintlify renames them. */
export const MINTLIFY_TOOLS = {
  search: "search_cresium",
  feedback: "submit_feedback",
} as const;

/** Mintlify may have stored a report whose answer never reached us; sending it twice duplicates it. */
export const DOCS_FEEDBACK_UNKNOWN_OUTCOME =
  "El reporte pudo haberse enviado igual: no lo reenvíes sin confirmarlo con el usuario.";

/** Mintlify returns 10 results, some of 20,000 characters, and offers no limit parameter. */
export const DOCS_SEARCH_MAX_RESULTS = 5;

export const DOCS_SEARCH_RESULT_MAX_CHARS = 1_500;

export const DOCS_SEARCH_PAGE_LINE = /^Page: *(.+)$/m;

export const BLOCK_SEPARATOR = "\n\n";

/** How to receive less from read_doc_page once a page was cut; the runner appends it to the cut note. */
export const DOCS_PAGE_NARROWING_ADVICE =
  "Para el resto buscá con search_docs la sección que necesitás: devuelve fragmentos y el path de cada página.";

/** How to receive less from search_docs once its results were cut. */
export const DOCS_SEARCH_NARROWING_ADVICE =
  "Buscá con palabras más específicas o leé una página puntual con read_doc_page.";

export const DOCS_PAGE_TOO_LARGE = `La página supera el máximo de ${MAX_UPSTREAM_BODY_BYTES / BYTES_PER_MIB} MiB y se dejó de leer. Buscá la sección que necesitás con search_docs.`;

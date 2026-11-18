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

import * as z from "zod";

import { defineTool } from "../tools/define.ts";
import type { ToolDef } from "../tools/types.ts";
import {
  BLOCK_SEPARATOR,
  DOCS_FEEDBACK_UNKNOWN_OUTCOME,
  MINTLIFY_TOOLS,
} from "./constants.ts";
import { callMintlify, fetchDocPage } from "./mintlify.ts";
import { formatDocsSearch } from "./search.ts";

export function createDocsTools(docsUrl: string): readonly ToolDef[] {
  const searchDocs = defineTool({
    name: "search_docs",
    description:
      "Busca en la documentación de Cresium (docs.cresium.com): guías, autenticación, webhooks, sandbox y referencia de la API. Devuelve los primeros resultados, recortados, con el path de cada página; para una página completa usá read_doc_page.",
    input: z.object({
      query: z
        .string()
        .min(1)
        .describe('Qué buscar, por ejemplo "verificar firma de webhook".'),
    }),
    access: "read",
    requiresVerifiedPartner: true,
    run: async ({ query }, ctx) => {
      const blocks = await callMintlify(
        docsUrl,
        { tool: MINTLIFY_TOOLS.search, args: { query, language: "es" } },
        ctx.signal,
      );
      return formatDocsSearch(blocks);
    },
  });

  const readDocPage = defineTool({
    name: "read_doc_page",
    description:
      'Lee una página completa de la documentación de Cresium en Markdown. Recibe el path que devuelve search_docs, por ejemplo "sandbox" o "api-reference/introduction".',
    input: z.object({
      path: z
        .string()
        .min(1)
        .describe("Path de la página, sin dominio ni extensión."),
    }),
    access: "read",
    requiresVerifiedPartner: true,
    run: ({ path }, ctx) => fetchDocPage(docsUrl, path, ctx.signal),
  });

  const sendDocsFeedback = defineTool({
    name: "send_docs_feedback",
    description:
      "Reporta un problema en una página de la documentación de Cresium (incorrecta, desactualizada, confusa o con un ejemplo roto) para que el equipo la corrija.",
    input: z.object({
      path: z.string().min(1).describe("Path de la página, sin extensión."),
      feedback: z.string().min(1).describe("Qué está mal o qué falta."),
    }),
    access: "write",
    unknownOutcomeAdvice: DOCS_FEEDBACK_UNKNOWN_OUTCOME,
    requiresVerifiedPartner: true,
    run: async ({ path, feedback }, ctx) => {
      const blocks = await callMintlify(
        docsUrl,
        { tool: MINTLIFY_TOOLS.feedback, args: { path, feedback } },
        ctx.signal,
      );
      return blocks.join(BLOCK_SEPARATOR);
    },
  });

  return [searchDocs, readDocPage, sendDocsFeedback];
}

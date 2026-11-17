import * as z from "zod";

import type { ConnectionGuard } from "../api/types.ts";
import { defineTool } from "../tools/define.ts";
import type { ToolDef } from "../tools/types.ts";
import { DOCS_FEEDBACK_UNKNOWN_OUTCOME, MINTLIFY_TOOLS } from "./constants.ts";
import { callMintlify, fetchDocPage } from "./mintlify.ts";

export function createDocsTools(
  docsUrl: string,
  ensureConnected: ConnectionGuard,
): readonly ToolDef[] {
  const searchDocs = defineTool({
    name: "search_docs",
    description:
      "Busca en la documentación de Cresium (docs.cresium.com): guías, autenticación, webhooks, sandbox y referencia de la API. Devuelve fragmentos con el path de cada página.",
    input: z.object({
      query: z
        .string()
        .min(1)
        .describe('Qué buscar, por ejemplo "verificar firma de webhook".'),
    }),
    access: "read",
    run: async ({ query }, ctx) => {
      await ensureConnected(ctx);
      return await callMintlify(
        docsUrl,
        { tool: MINTLIFY_TOOLS.search, args: { query, language: "es" } },
        ctx.signal,
      );
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
    run: async ({ path }, ctx) => {
      await ensureConnected(ctx);
      return await fetchDocPage(docsUrl, path, ctx.signal);
    },
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
    run: async ({ path, feedback }, ctx) => {
      await ensureConnected(ctx);
      return await callMintlify(
        docsUrl,
        { tool: MINTLIFY_TOOLS.feedback, args: { path, feedback } },
        ctx.signal,
      );
    },
  });

  return [searchDocs, readDocPage, sendDocsFeedback];
}

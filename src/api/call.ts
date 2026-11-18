import {
  CLIENT_ERROR_STATUS,
  SERVER_ERROR_STATUS,
  UNAUTHORIZED_STATUS,
} from "../constants.ts";
import { callCresium } from "../cresium/client.ts";
import type { CresiumRequest, CresiumResponse } from "../cresium/types.ts";
import { connectedTo } from "../partner/environment.ts";
import type { PartnerSession } from "../partner/types.ts";
import { ToolError } from "../tools/errors.ts";
import type { ToolAccess, ToolContext } from "../tools/types.ts";
import { API_WRITE_UNKNOWN_OUTCOME, AUTH_PROBLEMS } from "./constants.ts";
import type { Operation } from "./types.ts";

export function accessOf(operation: Operation): ToolAccess {
  return operation.method === "GET" ? "read" : "write";
}

export function toJsonText(value: unknown): string {
  return JSON.stringify(value);
}

export async function sendRequest(
  request: CresiumRequest,
  operation: Operation,
  ctx: ToolContext,
): Promise<CresiumResponse> {
  const { apiBaseUrl, credentials } = ctx.session;
  const startedAt = performance.now();
  let status: number | "failed" = "failed";
  try {
    const response = await callCresium(
      { baseUrl: apiBaseUrl, credentials },
      request,
      ctx.signal,
    );
    status = response.status;
    return response;
  } finally {
    ctx.logger.info(
      {
        operation: operation.id,
        status,
        durationMs: Math.round(performance.now() - startedAt),
      },
      "cresium api call",
    );
  }
}

function authHint(
  { status, body }: CresiumResponse,
  session: PartnerSession,
): string | undefined {
  const text = JSON.stringify(body);
  const problem = AUTH_PROBLEMS.find(({ match }) => text.includes(match));
  const connected = connectedTo(session.environment);
  if (problem) return `${problem.hint} ${connected}`;
  if (status !== UNAUTHORIZED_STATUS) return;
  return `Revisá x-api-key, x-api-secret y x-company-id, y que la key sea de ${session.environment}. ${connected}`;
}

export function assertSucceeded(
  response: CresiumResponse,
  operation: Operation,
  session: PartnerSession,
): void {
  if (response.status < CLIENT_ERROR_STATUS) return;
  // A 5xx (often a gateway timeout) can arrive after the write was applied.
  const writeMayHaveApplied =
    response.status >= SERVER_ERROR_STATUS && accessOf(operation) === "write";
  const parts = [
    `Cresium respondió ${response.status}: ${toJsonText(response.body)}`,
    authHint(response, session),
    writeMayHaveApplied ? API_WRITE_UNKNOWN_OUTCOME : undefined,
  ];
  throw new ToolError(parts.filter(Boolean).join(" "));
}

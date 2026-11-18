import { UNAUTHORIZED_STATUS } from "../constants.ts";
import { UserFacingError } from "../errors.ts";
import { CREDENTIAL_HEADERS } from "../partner/constants.ts";
import { connectedTo } from "../partner/environment.ts";
import type { PartnerSession } from "../partner/types.ts";
import { callCresium, previewRequest } from "./client.ts";
import {
  API_UNREACHABLE,
  AUTH_PROBLEMS,
  CLIENT_ERROR_STATUS,
  DRY_RUN_NOTE,
  SERVER_ERROR_STATUS,
} from "./constants.ts";
import { toCresiumRequest } from "./request.ts";
import type {
  CallContext,
  CresiumDryRun,
  CresiumRequest,
  CresiumResponse,
  Operation,
  OperationCall,
} from "./types.ts";

/** Whether the operation changes data: everything but GET. */
export function isWrite(operation: Operation): boolean {
  return operation.method !== "GET";
}

async function send(
  { session, signal, onCall }: CallContext,
  operation: Operation,
  request: CresiumRequest,
): Promise<CresiumResponse> {
  const startedAt = performance.now();
  let status: number | "failed" = "failed";
  try {
    const response = await callCresium(
      { baseUrl: session.apiBaseUrl, credentials: session.credentials },
      request,
      signal,
    );
    status = response.status;
    return response;
  } catch (error) {
    if (signal.aborted) throw error;
    // A reset can arrive after mage processed the request.
    throw new UserFacingError(
      `${API_UNREACHABLE} ${connectedTo(session.environment)}`,
      { outcomeUnknown: true, cause: error },
    );
  } finally {
    onCall({
      operation: operation.id,
      status,
      durationMs: Math.round(performance.now() - startedAt),
    });
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
  return `Revisá ${CREDENTIAL_HEADERS.apiKey}, ${CREDENTIAL_HEADERS.secret} y ${CREDENTIAL_HEADERS.companyId}, y que la key sea de ${session.environment}. ${connected}`;
}

function assertSucceeded(
  response: CresiumResponse,
  operation: Operation,
  session: PartnerSession,
): void {
  if (response.status < CLIENT_ERROR_STATUS) return;
  // A 5xx (often a gateway timeout) can arrive after the write was applied.
  const writeMayHaveApplied =
    response.status >= SERVER_ERROR_STATUS && isWrite(operation);
  const parts = [
    `Cresium respondió ${response.status}: ${JSON.stringify(response.body)}`,
    authHint(response, session),
  ];
  throw new UserFacingError(parts.filter(Boolean).join(" "), {
    outcomeUnknown: writeMayHaveApplied,
  });
}

/** Builds, signs and sends one operation and returns the answer's body; throws a UserFacingError for a request mage would reject or an answer of 400 or more. */
export async function callOperation(
  context: CallContext,
  operation: Operation,
  call: OperationCall,
): Promise<unknown> {
  const request = toCresiumRequest(operation, call);
  const response = await send(context, operation, request);
  assertSucceeded(response, operation, context.session);
  return response.body;
}

/** The request `callOperation` would send, without sending it. */
export function previewOperation(
  session: PartnerSession,
  operation: Operation,
  call: OperationCall,
): CresiumDryRun {
  const request = toCresiumRequest(operation, call);
  return {
    dryRun: true,
    environment: session.environment,
    ...previewRequest(session.apiBaseUrl, request),
    note: DRY_RUN_NOTE,
  };
}

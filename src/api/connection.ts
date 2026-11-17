import { createHash } from "node:crypto";

import { toCresiumRequest } from "../cresium/request.ts";
import type { ToolContext } from "../tools/types.ts";
import { assertSucceeded, sendRequest } from "./call.ts";
import {
  CONNECTION_CACHE_TTL_MS,
  CONNECTION_CHECK_OPERATION,
} from "./constants.ts";
import { findOperation } from "./operations.ts";
import type { ConnectionGuard } from "./types.ts";

export async function checkConnection(ctx: ToolContext): Promise<void> {
  const operation = findOperation(CONNECTION_CHECK_OPERATION);
  const request = toCresiumRequest(operation, { pathParams: {}, query: {} });
  const response = await sendRequest(request, operation, ctx);
  assertSucceeded(response, operation, ctx.session);
}

/** One-way key, so the cache never holds the secret and a right key with a wrong secret never matches. */
function fingerprintOf({
  environment,
  credentials,
}: ToolContext["session"]): string {
  const { apiKey, companyId, secret } = credentials;
  return createHash("sha256")
    .update(`${environment}|${apiKey}|${companyId}|${secret}`)
    .digest("hex");
}

export function createConnectionGuard(
  ttlMs = CONNECTION_CACHE_TTL_MS,
): ConnectionGuard {
  const verifiedUntil = new Map<string, number>();
  return async (ctx) => {
    const fingerprint = fingerprintOf(ctx.session);
    const expiry = verifiedUntil.get(fingerprint);
    if (expiry != null && expiry > Date.now()) return;
    await checkConnection(ctx);
    verifiedUntil.set(fingerprint, Date.now() + ttlMs);
  };
}

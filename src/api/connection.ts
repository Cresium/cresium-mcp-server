import { createHash } from "node:crypto";

import type { PartnerSession } from "../partner/types.ts";
import type { ToolContext } from "../tools/types.ts";
import { callApi } from "./call.ts";
import {
  CONNECTION_CACHE_TTL_MS,
  CONNECTION_CHECK_OPERATION,
} from "./constants.ts";
import { findOperation } from "./operations.ts";
import { NO_OPERATION_INPUT } from "./schema.ts";
import type { ConnectionGuard } from "./types.ts";

export async function checkConnection(ctx: ToolContext): Promise<void> {
  await callApi(
    ctx,
    findOperation(CONNECTION_CHECK_OPERATION),
    NO_OPERATION_INPUT,
  );
}

/** One-way key, so the cache never holds the secret and a right key with a wrong secret never matches. */
function fingerprintOf({ environment, credentials }: PartnerSession): string {
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

import { CREDENTIAL_HEADERS, VISIBLE_API_KEY_CHARS } from "./constants.ts";
import type { CredentialsResult } from "./types.ts";

const COMPANY_ID_PATTERN = /^\d+$/;

/** Reads the partner's credentials from the request headers, listing every missing or malformed one. */
export function readCredentials(headers: Headers): CredentialsResult {
  const apiKey = headers.get(CREDENTIAL_HEADERS.apiKey)?.trim() ?? "";
  const secret = headers.get(CREDENTIAL_HEADERS.secret)?.trim() ?? "";
  const companyId = headers.get(CREDENTIAL_HEADERS.companyId)?.trim() ?? "";

  const problems = [
    ...(apiKey ? [] : [`falta el header ${CREDENTIAL_HEADERS.apiKey}`]),
    ...(secret ? [] : [`falta el header ${CREDENTIAL_HEADERS.secret}`]),
    ...(companyId ? [] : [`falta el header ${CREDENTIAL_HEADERS.companyId}`]),
    ...(companyId && !COMPANY_ID_PATTERN.test(companyId)
      ? [`${CREDENTIAL_HEADERS.companyId} tiene que ser un número`]
      : []),
  ];
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, credentials: { apiKey, secret, companyId } };
}

/** Shows only the last characters of an API key, so logs can tell keys apart without exposing them. */
export function maskApiKey(apiKey: string): string {
  return `****${apiKey.slice(-VISIBLE_API_KEY_CHARS)}`;
}

import { createHmac } from "node:crypto";

import type {
  CresiumRequest,
  CresiumResponse,
  CresiumTarget,
  SignedFields,
} from "./types.ts";

/** HMAC-SHA256 over `timestamp|METHOD|url|body`, base64. Same formula mage verifies in `verifyPartnerSignature`. */
export function signRequest(secret: string, fields: SignedFields): string {
  const payload = `${fields.timestamp}|${fields.method}|${fields.url}|${fields.body}`;
  return createHmac("sha256", secret).update(payload).digest("base64");
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Sends one signed V3 request and returns its status and body, whatever the status. */
export async function callCresium(
  { baseUrl, credentials }: CresiumTarget,
  { method, url, body }: CresiumRequest,
  signal: AbortSignal,
): Promise<CresiumResponse> {
  const jsonBody = body == null ? "" : JSON.stringify(body);
  const timestamp = new Date().toISOString();
  const signature = signRequest(credentials.secret, {
    timestamp,
    method,
    url,
    body: jsonBody,
  });
  // mage signs "" for a request without body; a stray Content-Type would make it parse and sign "{}".
  const contentType: Record<string, string> = jsonBody
    ? { "content-type": "application/json" }
    : {};
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      "x-api-key": credentials.apiKey,
      "x-company-id": credentials.companyId,
      "x-timestamp": timestamp,
      "x-signature": signature,
      ...contentType,
    },
    ...(jsonBody ? { body: jsonBody } : {}),
    signal,
  });
  return { status: response.status, body: parseBody(await response.text()) };
}

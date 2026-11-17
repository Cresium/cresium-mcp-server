import { createHmac } from "node:crypto";

import { USER_AGENT } from "../constants.ts";
import { TIMESTAMP_PLACEHOLDER, TRACE_ID_HEADER } from "./constants.ts";
import type {
  CresiumCallOptions,
  CresiumRequest,
  CresiumRequestPreview,
  CresiumResponse,
  CresiumTarget,
  SignedFields,
} from "./types.ts";

function toSignedText(fields: SignedFields): string {
  return `${fields.timestamp}|${fields.method}|${fields.url}|${fields.body}`;
}

/** HMAC-SHA256 over `timestamp|METHOD|url|body`, base64. Same formula mage verifies in `verifyPartnerSignature`. */
export function signRequest(secret: string, fields: SignedFields): string {
  const signedText = toSignedText(fields);
  return createHmac("sha256", secret).update(signedText).digest("base64");
}

// mage signs "" for a request without body.
function serializeBody(body: unknown): string {
  return body == null ? "" : JSON.stringify(body);
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function previewRequest(
  baseUrl: string,
  { method, url, body }: CresiumRequest,
): CresiumRequestPreview {
  const signedText = toSignedText({
    timestamp: TIMESTAMP_PLACEHOLDER,
    method,
    url,
    body: serializeBody(body),
  });
  return { method, url: `${baseUrl}${url}`, body: body ?? null, signedText };
}

/** Sends one signed V3 request and returns its status and body, whatever the status. */
export async function callCresium(
  { baseUrl, credentials }: CresiumTarget,
  { method, url, body }: CresiumRequest,
  { signal, traceId }: CresiumCallOptions,
): Promise<CresiumResponse> {
  const jsonBody = serializeBody(body);
  const timestamp = new Date().toISOString();
  const signature = signRequest(credentials.secret, {
    timestamp,
    method,
    url,
    body: jsonBody,
  });
  // A stray Content-Type on a request without body would make mage parse and sign "{}".
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
      [TRACE_ID_HEADER]: traceId,
      "user-agent": USER_AGENT,
      ...contentType,
    },
    ...(jsonBody ? { body: jsonBody } : {}),
    signal,
  });
  return { status: response.status, body: parseBody(await response.text()) };
}

import { createHmac } from "node:crypto";

import { USER_AGENT } from "../constants.ts";
import { MAGE_HEADERS, TIMESTAMP_PLACEHOLDER } from "./constants.ts";
import type {
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

export async function callCresium(
  { baseUrl, credentials }: CresiumTarget,
  { method, url, body }: CresiumRequest,
  signal: AbortSignal,
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
      [MAGE_HEADERS.apiKey]: credentials.apiKey,
      [MAGE_HEADERS.companyId]: credentials.companyId,
      [MAGE_HEADERS.timestamp]: timestamp,
      [MAGE_HEADERS.signature]: signature,
      "user-agent": USER_AGENT,
      ...contentType,
    },
    ...(jsonBody ? { body: jsonBody } : {}),
    signal,
  });
  return { status: response.status, body: parseBody(await response.text()) };
}

import { timingSafeEqual } from "node:crypto";

import type { PartnerSession } from "../partner/types.ts";
import { signRequest } from "./client.ts";
import { SIGNATURE_WINDOW_MS } from "./constants.ts";
import { SIGNATURE_MISTAKES } from "./mistakes.ts";
import type {
  SignatureCheck,
  SignatureDiagnosis,
  SignedFields,
} from "./types.ts";

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const EPOCH_MS = /^\d{13}$/;

const WINDOW_TEXT = {
  request:
    "La API rechaza un request cuyo timestamp difiere más de 60 segundos de su reloj.",
  webhook:
    "La documentación sugiere descartar los webhooks de más de 5 minutos.",
} as const;

function matches(received: string, candidate: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(candidate);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** mage signs the body it parsed and serialized again; a webhook is signed over the raw text. */
function expectedBody({ kind, body }: SignatureCheck): string {
  if (kind === "webhook" || body === "") return body;
  try {
    return JSON.stringify(JSON.parse(body));
  } catch {
    return body;
  }
}

function expectedFields(check: SignatureCheck): SignedFields {
  return {
    timestamp: check.timestamp,
    method: check.kind === "webhook" ? "POST" : check.method,
    url: check.url,
    body: expectedBody(check),
  };
}

/** Milliseconds since the epoch, or NaN when the server would not read the timestamp. */
function timestampMs({ kind, timestamp }: SignatureCheck): number {
  if (ISO_8601.test(timestamp)) return Date.parse(timestamp);
  return kind === "request" && EPOCH_MS.test(timestamp)
    ? Number(timestamp)
    : Number.NaN;
}

function structuralWarnings(check: SignatureCheck, now: Date): string[] {
  const warnings: string[] = [];
  const sentAt = timestampMs(check);
  if (Number.isNaN(sentAt)) {
    warnings.push(
      check.kind === "request"
        ? "El timestamp no es ISO 8601 en UTC (2026-04-21T15:42:03.000Z) ni epoch en milisegundos."
        : "El timestamp de un webhook es un string ISO 8601 en UTC (2026-04-21T15:42:03.000Z): firmá exactamente el valor de x-timestamp.",
    );
  }
  const offsetMs = Math.abs(now.getTime() - sentAt);
  if (offsetMs > SIGNATURE_WINDOW_MS[check.kind]) {
    warnings.push(
      `El timestamp difiere ${Math.round(offsetMs / 1000)} segundos de la hora del servidor. ${WINDOW_TEXT[check.kind]}`,
    );
  }
  if (check.kind === "request" && !check.url.startsWith("/")) {
    warnings.push(
      "La url de un request tiene que ser el path con su query y empezar con /, sin dominio.",
    );
  }
  if (check.kind === "webhook" && !/^https?:\/\//.test(check.url)) {
    warnings.push(
      "La url de un webhook tiene que ser la URL completa registrada, con https:// y su query.",
    );
  }
  return warnings;
}

/**
 * Says whether `check.signature` is what the session's secret produces for those inputs and, if not,
 * which known mistake reproduces it. `now` is the server clock. The result never carries the secret,
 * the API key or the signature the secret produces.
 */
export function diagnoseSignature(
  session: PartnerSession,
  check: SignatureCheck,
  now: Date,
): SignatureDiagnosis {
  const warnings = structuralWarnings(check, now);
  const fields = expectedFields(check);
  if (
    matches(check.signature, signRequest(session.credentials.secret, fields))
  ) {
    return { valid: true, warnings };
  }
  const input = {
    session,
    kind: check.kind,
    fields,
    sentBody: check.body,
  };
  const checked: string[] = [];
  for (const { id, explanation, forge } of SIGNATURE_MISTAKES) {
    const forged = forge(input);
    if (!forged) continue;
    if (matches(check.signature, forged)) {
      return { valid: false, cause: { id, explanation }, warnings };
    }
    checked.push(id);
  }
  return { valid: false, checked, warnings };
}

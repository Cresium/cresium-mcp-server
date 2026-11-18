import { CREDENTIAL_HEADERS } from "../partner/constants.ts";

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** The headers mage reads on every signed request. It takes the credentials under the names partners already use. */
export const MAGE_HEADERS = {
  apiKey: CREDENTIAL_HEADERS.apiKey,
  companyId: CREDENTIAL_HEADERS.companyId,
  timestamp: "x-timestamp",
  signature: "x-signature",
} as const;

export const CLIENT_ERROR_STATUS = 400;
export const SERVER_ERROR_STATUS = 500;

/** Path values that would empty the segment or let fetch normalize the URL away from the signed one. */
export const UNSAFE_PATH_VALUES: ReadonlySet<string> = new Set(["", ".", ".."]);

export const API_UNREACHABLE =
  "La API de Cresium no respondió: no se pudo conectar o se cortó la conexión.";

export const TIMESTAMP_PLACEHOLDER = `<${MAGE_HEADERS.timestamp}>`;

export const DRY_RUN_NOTE = `No se envió nada a Cresium. Para firmar este pedido en código propio: ${MAGE_HEADERS.signature} = base64(HMAC-SHA256(secret, signedText)), reemplazando ${TIMESTAMP_PLACEHOLDER} por el valor del header ${MAGE_HEADERS.timestamp} (ISO 8601, a menos de 60 segundos de la hora real).`;

/** What each mage authentication failure means for the partner's headers, matched against the error message. */
export const AUTH_PROBLEMS = [
  {
    match: "Partner not found",
    hint: `${CREDENTIAL_HEADERS.apiKey} no existe en este ambiente.`,
  },
  {
    match: "Invalid signature",
    hint: `${CREDENTIAL_HEADERS.secret} no corresponde a esa ${CREDENTIAL_HEADERS.apiKey}.`,
  },
  {
    match: "Company not found in partner",
    hint: `${CREDENTIAL_HEADERS.companyId} no pertenece a esa ${CREDENTIAL_HEADERS.apiKey}.`,
  },
  {
    match: "Company is not approved",
    hint: `La empresa de ${CREDENTIAL_HEADERS.companyId} todavía no está aprobada.`,
  },
  {
    match: "does not have permission",
    hint: "La key no tiene permiso para esta operación: pedilo a Cresium.",
  },
] as const;

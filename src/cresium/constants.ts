export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export const CLIENT_ERROR_STATUS = 400;
export const SERVER_ERROR_STATUS = 500;

/** Path values that would empty the segment or let fetch normalize the URL away from the signed one. */
export const UNSAFE_PATH_VALUES: ReadonlySet<string> = new Set(["", ".", ".."]);

export const TIMESTAMP_PLACEHOLDER = "<x-timestamp>";

export const DRY_RUN_NOTE = `No se envió nada a Cresium. Para firmar este pedido en código propio: x-signature = base64(HMAC-SHA256(secret, signedText)), reemplazando ${TIMESTAMP_PLACEHOLDER} por el valor del header x-timestamp (ISO 8601, a menos de 60 segundos de la hora real).`;

/** What each mage authentication failure means for the partner's headers, matched against the error message. */
export const AUTH_PROBLEMS = [
  {
    match: "Partner not found",
    hint: "x-api-key no existe en este ambiente.",
  },
  {
    match: "Invalid signature",
    hint: "x-api-secret no corresponde a esa x-api-key.",
  },
  {
    match: "Company not found in partner",
    hint: "x-company-id no pertenece a esa x-api-key.",
  },
  {
    match: "Company is not approved",
    hint: "La empresa de x-company-id todavía no está aprobada.",
  },
  {
    match: "does not have permission",
    hint: "La key no tiene permiso para esta operación: pedilo a Cresium.",
  },
] as const;

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export const SEARCH_LIMIT = 8;

/** A query word found in the id, summary or tags says more about an operation than one found in its long description. */
export const TITLE_MATCH_SCORE = 3;
export const DESCRIPTION_MATCH_SCORE = 1;

/** Words partners use that the catalogue spells differently. Keys and values are lowercase without accents. */
export const SEARCH_SYNONYMS: ReadonlyMap<string, readonly string[]> = new Map([
  ["refund", ["revertir"]],
  ["reembolso", ["revertir"]],
  ["devolver", ["revertir"]],
  ["devolucion", ["revertir"]],
  ["transferir", ["transferencia"]],
  ["enviar", ["transferencia"]],
  ["retiro", ["transferencia"]],
  ["withdrawal", ["transferencia"]],
  ["payout", ["transferencia"]],
  ["plata", ["transferencia", "saldo"]],
  ["dinero", ["transferencia", "saldo"]],
  ["fee", ["comision", "markup"]],
  ["payment", ["pago"]],
  ["account", ["cuenta"]],
]);

/** A cheap signed read every partner key can run; check_connection uses it to prove the credentials work. */
export const CONNECTION_CHECK_OPERATION = "GET /v3/balance/wallets";

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

/** Cresium may have applied a write the client stopped waiting for; retrying blindly could repeat a refund or transfer. */
export const API_WRITE_UNKNOWN_OUTCOME =
  "Cresium pudo haberla aplicado igual: verificá el estado con read_api (por ejemplo GET /v3/transaction/search) antes de reintentar.";

export const CONNECTION_CACHE_TTL_MS = 10 * 60_000;

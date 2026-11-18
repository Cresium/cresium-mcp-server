export const SEARCH_LIMIT = 8;

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
  ["billetera", ["wallets", "saldo"]],
  ["billeteras", ["wallets", "saldo"]],
  ["wallet", ["wallets", "saldo"]],
  ["fee", ["comision", "markup"]],
  ["payment", ["pago"]],
  ["account", ["cuenta"]],
]);

/** A cheap signed read every partner key can run; check_connection uses it to prove the credentials work. */
export const CONNECTION_CHECK_OPERATION = "GET /v3/balance/wallets";

/** Cresium may have applied a write the client stopped waiting for; retrying blindly could repeat a refund or transfer. */
export const API_WRITE_UNKNOWN_OUTCOME =
  "Cresium pudo haberla aplicado igual: verificá el estado con read_api (por ejemplo GET /v3/transaction/search) antes de reintentar.";

export const SCHEMA_HINT = "Revisá el schema con search_api.";

export const CONNECTION_CACHE_TTL_MS = 10 * 60_000;

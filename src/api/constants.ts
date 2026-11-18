export const SEARCH_LIMIT = 8;

export const TITLE_MATCH_SCORE = 3;
/** Added when the word is in the summary itself, so "comisiones" finds the operation about one before the tag shared by four. */
export const SUMMARY_MATCH_BONUS = 1;

/** Shortest word that may lose a plural ending, so "cvus" matches "cvu" but "mis" stays as it is. */
export const MIN_PLURAL_WORD_LENGTH = 5;

/** Words that say nothing about the operation and would match inside any other word ("de" is in "dedicado"). */
export const SEARCH_STOPWORDS: ReadonlySet<string> = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "el",
  "en",
  "la",
  "las",
  "los",
  "mi",
  "mis",
  "para",
  "por",
  "un",
  "una",
  "y",
  "o",
  "an",
  "and",
  "for",
  "from",
  "in",
  "my",
  "of",
  "the",
  "to",
  "what",
  "does",
]);

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
  ["transaction", ["transaccion"]],
  ["invoice", ["factura", "cobrar"]],
  ["create", ["crear"]],
  ["list", ["listar", "buscar"]],
  ["deactivate", ["baja"]],
  ["cancel", ["borrar", "baja"]],
]);

/** A cheap signed read every partner key can run; check_connection uses it to prove the credentials work. */
export const CONNECTION_CHECK_OPERATION = "GET /v3/balance/wallets";

/** Cresium may have applied a write the client stopped waiting for; retrying blindly could repeat a refund or transfer. */
export const API_WRITE_UNKNOWN_OUTCOME =
  "Cresium pudo haberla aplicado igual: verificá el estado con read_api (por ejemplo GET /v3/transaction/search) antes de reintentar.";

export const CONNECTION_CACHE_TTL_MS = 10 * 60_000;

/** Starts the note that follows an answer when some `fields` paths matched nothing; the paths come after it. */
export const UNMATCHED_FIELDS_NOTE =
  "Nota: estos paths de fields no existen en ningún ítem y se ignoraron:";

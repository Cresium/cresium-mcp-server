import type { AccessMode } from "../tools/types.ts";
import type { WriteGuidance } from "./types.ts";

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
  ["cobro", ["pago unico"]],
  ["cobrar", ["pago unico"]],
  ["create", ["crear"]],
  ["list", ["listar", "buscar"]],
  ["deactivate", ["baja"]],
  ["cancel", ["borrar", "baja"]],
]);

/** What the API tools tell the agent about writing: a read-only connection has no write_api to point to. */
export const WRITE_GUIDANCE = {
  full: {
    beforeCalling: "Usala antes de read_api o write_api.",
    readDescription: "Para escribir usá write_api.",
    readWrongAccess: "escribe datos. Usá write_api para ejecutarla.",
  },
  "read-only": {
    beforeCalling: "Usala antes de read_api.",
    readDescription:
      "Esta conexión es de solo lectura: para escribir, conectate a la misma URL sin /read-only.",
    readWrongAccess:
      "escribe datos y esta conexión es de solo lectura: para ejecutarla, conectate a la misma URL sin /read-only.",
  },
} as const satisfies Record<AccessMode, WriteGuidance>;

/** Follows the operation id when write_api is asked for a read. */
export const WRITE_API_WRONG_ACCESS = "es de lectura. Usá read_api.";

/** A cheap signed read every partner key can run; check_connection uses it to prove the credentials work. */
export const CONNECTION_CHECK_OPERATION = "GET /v3/balance/wallets";

/** Cresium may have applied a write the client stopped waiting for; retrying blindly could repeat a refund or transfer. */
export const API_WRITE_UNKNOWN_OUTCOME =
  "Cresium pudo haberla aplicado igual: verificá el estado con read_api (por ejemplo GET /v3/transaction/search) antes de reintentar.";

export const SCHEMA_HINT = "Revisá el schema con search_api.";

export const CONNECTION_CACHE_TTL_MS = 10 * 60_000;

/** Starts the note that follows an answer when some `fields` paths matched nothing; the paths come after it. */
export const UNMATCHED_FIELDS_NOTE =
  "Nota: estos paths de fields no existen en ningún ítem y se ignoraron:";

/** How to receive less from read_api once an answer was cut; the runner appends it to the cut note. */
export const READ_API_NARROWING_ADVICE =
  "Pedí una página más chica con pageSize, acotá con los filtros de la operación o pedí solo los campos que necesitás con fields.";

/** The most characters of the URL or the body that a confirmation shows; a longer one is cut and its size said. */
export const CONFIRMATION_SHOWN_CHARS = 1500;

/** Bounds diagnose_signature's inputs: it hashes them about 20 times per call, with credentials nobody verified. */
export const DIAGNOSE_MAX_BODY_LENGTH = 65_536;
export const DIAGNOSE_MAX_URL_LENGTH = 4_096;

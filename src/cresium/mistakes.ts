import { createHash } from "node:crypto";

import { CREDENTIAL_HEADERS } from "../partner/constants.ts";
import { signRequest, signText, toSignedText } from "./client.ts";
import type { MistakeCase, SignatureMistake, SignedFields } from "./types.ts";

// Not in constants.ts: each entry calls the signing functions, which constants.ts must stay free of.

function withFields(
  { session, fields }: MistakeCase,
  patch: Partial<SignedFields>,
): string {
  return signRequest(session.credentials.secret, { ...fields, ...patch });
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => Number(a > b) - Number(a < b))
        .map(([key, child]) => [key, sortKeys(child)]),
    );
  }
  return value;
}

/** The body re-serialized by `rewrite`, or undefined when it is not JSON or comes out unchanged. */
function reserialized(
  { fields }: MistakeCase,
  rewrite: (parsed: unknown) => string,
): string | undefined {
  try {
    const text = rewrite(JSON.parse(fields.body));
    return text === fields.body ? undefined : text;
  } catch {
    return;
  }
}

function signedBody(input: MistakeCase, body: string | undefined) {
  return body ? withFields(input, { body }) : undefined;
}

function withoutQuery(url: string): string | undefined {
  return url.includes("?") ? url.slice(0, url.indexOf("?")) : undefined;
}

function pathOf(url: string): string | undefined {
  try {
    const { pathname, search } = new URL(url);
    return `${pathname}${search}`;
  } catch {
    return;
  }
}

/** Tried whatever the secret looks like: skipping it for some secrets would tell the agent what the secret looks like. */
function decodedSecretSignature(
  { session, fields }: MistakeCase,
  encoding: "base64" | "hex",
): string {
  return signText(
    Buffer.from(session.credentials.secret, encoding),
    toSignedText(fields),
  );
}

/** Known ways a client gets the signature wrong, most common first. Adding a mistake is adding one entry. */
export const SIGNATURE_MISTAKES: readonly SignatureMistake[] = [
  {
    id: "hex-digest",
    explanation:
      "La firma está en hexadecimal. Cresium espera el digest HMAC-SHA256 en Base64: usá digest('base64') (en Python, base64.b64encode(hmac.digest())).",
    forge: (input) =>
      Buffer.from(withFields(input, {}), "base64").toString("hex"),
  },
  {
    id: "base64url-digest",
    explanation:
      "La firma está en Base64 URL-safe (con - y _, sin =). Cresium espera Base64 estándar con relleno: no uses base64url.",
    forge: (input) =>
      withFields(input, {})
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", ""),
  },
  {
    id: "plain-sha256",
    explanation:
      "Se calculó un SHA-256 simple del texto, sin clave. Hay que usar HMAC-SHA256 con el secret del partner como clave.",
    forge: ({ fields }) =>
      createHash("sha256").update(toSignedText(fields)).digest("base64"),
  },
  {
    id: "lowercase-method",
    explanation:
      "El método se firmó en minúsculas. Va en mayúsculas (POST, no post), como viaja en el pedido.",
    forge: ({ session, fields }) =>
      signText(
        session.credentials.secret,
        `${fields.timestamp}|${fields.method.toLowerCase()}|${fields.url}|${fields.body}`,
      ),
  },
  {
    id: "url-without-query",
    explanation:
      "Se firmó la URL sin su query string. Hay que firmar el path con la query completa, tal cual se envía (en un webhook, la URL registrada con su query).",
    forge: (input) => {
      const url = withoutQuery(input.fields.url);
      return url ? withFields(input, { url }) : undefined;
    },
  },
  {
    id: "full-url-instead-of-path",
    explanation:
      "Se firmó la URL completa con el dominio. En un request a la API se firma solo el path con su query (por ejemplo /v3/balance/wallets), sin dominio.",
    forge: (input) =>
      input.kind === "request"
        ? withFields(input, {
            url: `${input.session.apiBaseUrl}${input.fields.url}`,
          })
        : undefined,
  },
  {
    id: "path-instead-of-full-url",
    explanation:
      "Se firmó solo el path del webhook. Para un webhook se firma la URL completa que registraste en Cresium, con dominio y query.",
    forge: (input) => {
      const url =
        input.kind === "webhook" ? pathOf(input.fields.url) : undefined;
      return url ? withFields(input, { url }) : undefined;
    },
  },
  {
    id: "unencoded-brackets",
    explanation:
      "Los corchetes de la query se firmaron sin codificar. Los arrays se envían y se firman como nombre%5B%5D=valor, no como nombre[]=valor.",
    forge: (input) =>
      /%5[BD]/i.test(input.fields.url)
        ? withFields(input, {
            url: input.fields.url
              .replaceAll(/%5B/gi, "[")
              .replaceAll(/%5D/gi, "]"),
          })
        : undefined,
  },
  {
    id: "body-pretty-printed",
    explanation:
      "Se firmó el body con sangrías y saltos de línea. Hay que firmar el JSON compacto, sin espacios ni saltos, y enviar ese mismo texto.",
    forge: (input) =>
      signedBody(
        input,
        reserialized(input, (parsed) => JSON.stringify(parsed, null, 2)),
      ),
  },
  {
    id: "body-keys-sorted",
    explanation:
      "Se firmó el body con las claves ordenadas alfabéticamente. Hay que firmar el JSON con el mismo orden de claves con que se envía.",
    forge: (input) =>
      signedBody(
        input,
        reserialized(input, (parsed) => JSON.stringify(sortKeys(parsed))),
      ),
  },
  {
    id: "body-not-compacted",
    explanation:
      "Se firmó el body tal como se envió, con espacios o saltos de línea. La API lo parsea y lo vuelve a serializar compacto antes de verificar: firmá el JSON compacto (JSON.stringify) y enviá ese mismo texto.",
    forge: (input) =>
      input.kind === "request" && input.sentBody !== input.fields.body
        ? withFields(input, { body: input.sentBody })
        : undefined,
  },
  {
    id: "body-reserialized",
    explanation:
      "Se firmó el body después de parsearlo y volver a serializarlo. En un webhook hay que firmar el body crudo, byte por byte como llegó, antes de parsearlo.",
    forge: (input) =>
      input.kind === "webhook"
        ? signedBody(
            input,
            reserialized(input, (parsed) => JSON.stringify(parsed)),
          )
        : undefined,
  },
  {
    id: "empty-body-as-braces",
    explanation:
      "Para un request sin body se firmó {}. Sin body se firma el texto vacío (el texto termina en |).",
    forge: (input) =>
      input.fields.body === "" ? withFields(input, { body: "{}" }) : undefined,
  },
  {
    id: "empty-body-as-null",
    explanation:
      "Para un request sin body se firmó null. Sin body se firma el texto vacío (el texto termina en |).",
    forge: (input) =>
      input.fields.body === ""
        ? withFields(input, { body: "null" })
        : undefined,
  },
  {
    id: "missing-final-pipe",
    explanation:
      "Sin body se omitió el | final. El texto a firmar siempre tiene cuatro partes: timestamp|MÉTODO|url| y el body, que puede quedar vacío.",
    forge: (input) =>
      input.fields.body === ""
        ? signText(
            input.session.credentials.secret,
            toSignedText(input.fields).slice(0, -1),
          )
        : undefined,
  },
  {
    id: "body-trailing-newline",
    explanation:
      "El body firmado termina en un salto de línea que la API no ve. Firmá el JSON compacto sin salto final.",
    forge: (input) => withFields(input, { body: `${input.fields.body}\n` }),
  },
  {
    id: "secret-base64-decoded",
    explanation:
      "El secret se decodificó de Base64 antes de usarlo como clave. Usalo tal cual, como el texto que te dio Cresium.",
    forge: (input) => decodedSecretSignature(input, "base64"),
  },
  {
    id: "secret-hex-decoded",
    explanation:
      "El secret se decodificó de hexadecimal antes de usarlo como clave. Usalo tal cual, como el texto que te dio Cresium.",
    forge: (input) => decodedSecretSignature(input, "hex"),
  },
  {
    id: "api-key-as-secret",
    explanation: `Se firmó con la API key en lugar del secret. La clave del HMAC es el secret del partner (${CREDENTIAL_HEADERS.secret}), no la API key.`,
    forge: (input) =>
      signRequest(input.session.credentials.apiKey, input.fields),
  },
];

import { MAX_RESULT_CHARS } from "./constants.ts";

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;

/** `text` cut to the result limit, followed by a note saying how much was dropped and how to ask for less. */
export function limitText(text: string, narrowingAdvice: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  const last = text.charCodeAt(MAX_RESULT_CHARS - 1);
  const keep =
    last >= HIGH_SURROGATE_START && last <= HIGH_SURROGATE_END
      ? MAX_RESULT_CHARS - 1
      : MAX_RESULT_CHARS;
  const dropped = text.length - keep;
  return `${text.slice(0, keep)}\n\n[Resultado cortado: se omitieron ${dropped} de ${text.length} caracteres, así que el texto quedó incompleto (si era JSON, ya no es JSON válido). ${narrowingAdvice}]`;
}

import type { CresiumDryRun } from "../cresium/types.ts";
import { UserFacingError } from "../errors.ts";
import { ENVIRONMENT_LABELS } from "../partner/constants.ts";
import type { ConfirmationRequest } from "../tools/types.ts";
import {
  CONFIRMATION_MAX_CHARS,
  CONFIRMATION_NO_BODY_NOTE,
  CONFIRMATION_SHOWN_CHARS,
  CONFIRMATION_TOO_LARGE,
} from "./constants.ts";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && !!value && !Array.isArray(value);
}

function shortened(text: string): string {
  if (text.length <= CONFIRMATION_SHOWN_CHARS) return text;
  return `${text.slice(0, CONFIRMATION_SHOWN_CHARS)}… [se muestran ${CONFIRMATION_SHOWN_CHARS} de ${text.length} caracteres]`;
}

/**
 * The body with each long text shortened on its own, at any depth. Cutting the whole body instead would let
 * a long text sent first push the amount or the destination out of what the person sees.
 */
function shownBody(value: unknown): unknown {
  if (typeof value === "string") return shortened(value);
  if (Array.isArray(value)) {
    return value.map((element: unknown) => shownBody(element));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, shownBody(child)]),
    );
  }
  return value;
}

/**
 * What the person is asked for a write about to go out, from the same preview a dry run returns. Every key and
 * every non-text value is shown; a call too large to show that way throws, before anything is sent.
 */
export function confirmationFor(
  operationId: string,
  { environment, method, url, body }: CresiumDryRun,
): ConfirmationRequest {
  const bodyText = body == null ? "" : JSON.stringify(body);
  const message = [
    `Un agente quiere ejecutar una escritura en ${ENVIRONMENT_LABELS[environment]}:`,
    `Operación: ${operationId}`,
    `Método: ${method}`,
    `URL: ${url}`,
    ...(body == null
      ? ["Body: (sin body)", CONFIRMATION_NO_BODY_NOTE]
      : [`Body: ${JSON.stringify(shownBody(body))}`]),
    "Aceptá para enviarla tal cual; si la rechazás o cancelás no se envía nada.",
  ].join("\n");
  if (message.length > CONFIRMATION_MAX_CHARS) {
    throw new UserFacingError(CONFIRMATION_TOO_LARGE);
  }
  return {
    message,
    effect: JSON.stringify([operationId, method, url, bodyText]),
  };
}

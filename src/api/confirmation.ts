import type { CresiumDryRun } from "../cresium/types.ts";
import { ENVIRONMENT_LABELS } from "../partner/constants.ts";
import type { ConfirmationRequest } from "../tools/types.ts";
import { CONFIRMATION_SHOWN_CHARS } from "./constants.ts";

function shown(text: string): string {
  if (text.length <= CONFIRMATION_SHOWN_CHARS) return text;
  return `${text.slice(0, CONFIRMATION_SHOWN_CHARS)}… [se muestran ${CONFIRMATION_SHOWN_CHARS} de ${text.length} caracteres]`;
}

/** What the person is asked for a write about to go out, from the same preview a dry run returns. */
export function confirmationFor(
  operationId: string,
  { environment, method, url, body }: CresiumDryRun,
): ConfirmationRequest {
  const bodyText = body == null ? "" : JSON.stringify(body);
  return {
    message: [
      `Un agente quiere ejecutar una escritura en ${ENVIRONMENT_LABELS[environment]}:`,
      `Operación: ${operationId}`,
      `Método: ${method}`,
      `URL: ${shown(url)}`,
      `Body: ${bodyText ? shown(bodyText) : "(sin body)"}`,
      "Aceptá para enviarla tal cual; si la rechazás o cancelás no se envía nada.",
    ].join("\n"),
    effect: JSON.stringify([operationId, method, url, bodyText]),
  };
}

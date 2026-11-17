import { ENVIRONMENT_LABELS } from "./constants.ts";
import type { Environment } from "./types.ts";

export function connectedTo(environment: Environment): string {
  return `Ambiente conectado: ${ENVIRONMENT_LABELS[environment]}.`;
}

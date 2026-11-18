/**
 * The most characters of one tool result the agent receives. claude.ai documents about 150,000 characters
 * per tool result and refuses a larger one outright; 50,000 (roughly 12,000 tokens) stays a third of that,
 * so one listing cannot crowd out the rest of the conversation and several results still fit in a turn.
 * A full page of 100 transactions (about 500 characters each) fits. The cut note comes on top of it.
 */
export const MAX_RESULT_CHARS = 50_000;

/** For a tool that sets no narrowingAdvice of its own. */
export const DEFAULT_NARROWING_ADVICE =
  "Repetí el pedido pidiendo menos datos.";

/** How long a person has to answer before the confirmation state expires and the call must be made again. */
export const CONFIRMATION_TTL_SECONDS = 300;

/** The name of the one question a confirmation asks, which the client answers under the same name. */
export const CONFIRMATION_INPUT_KEY = "confirmar";

export const NOT_CONFIRMED_MESSAGE =
  "El usuario no confirmó la escritura, así que no se envió nada a Cresium. No la repitas salvo que el usuario te lo pida.";

/** Path values that would empty the segment or let fetch normalize the URL away from the signed one. */
export const UNSAFE_PATH_VALUES: ReadonlySet<string> = new Set(["", ".", ".."]);

/** Stands for the `x-timestamp` value in a dry run, where nothing is signed. */
export const TIMESTAMP_PLACEHOLDER = "<x-timestamp>";

/** Tells the agent how the Cresium API verifies a signature, since a dry run signs nothing. */
export const DRY_RUN_NOTE = `No se envió nada a Cresium. Para firmar este pedido en código propio: x-signature = base64(HMAC-SHA256(secret, signedText)), reemplazando ${TIMESTAMP_PLACEHOLDER} por el valor del header x-timestamp (ISO 8601, a menos de 60 segundos de la hora real).`;

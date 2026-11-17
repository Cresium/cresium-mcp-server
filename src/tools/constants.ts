export const TOOL_ERROR_NAME = "ToolError";

/** Cresium may have applied a write the client stopped waiting for; retrying blindly could repeat a refund or transfer. */
export const UNKNOWN_WRITE_OUTCOME =
  "Cresium pudo haberla aplicado igual: verificá el estado con read_api (por ejemplo GET /v3/transaction/search) antes de reintentar.";

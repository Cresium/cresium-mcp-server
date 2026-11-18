import { TOOL_ERROR_NAME } from "./constants.ts";

export class ToolError extends Error {
  override readonly name = TOOL_ERROR_NAME;
  /** The request may have reached the API before this failed, so a write may have been applied. */
  readonly outcomeUnknown: boolean;

  constructor(
    message: string,
    { outcomeUnknown = false }: { readonly outcomeUnknown?: boolean } = {},
  ) {
    super(message);
    this.outcomeUnknown = outcomeUnknown;
  }
}

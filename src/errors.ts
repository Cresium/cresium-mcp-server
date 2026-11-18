import { USER_FACING_ERROR_NAME } from "./constants.ts";

/** The only error whose message reaches the agent; any other error is hidden behind a generic one. */
export class UserFacingError extends Error {
  override readonly name = USER_FACING_ERROR_NAME;
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

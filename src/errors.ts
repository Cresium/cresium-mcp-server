import { USER_FACING_ERROR_NAME } from "./constants.ts";

/** The only error whose message reaches the agent; any other error is hidden behind a generic one. */
export class UserFacingError extends Error {
  override readonly name = USER_FACING_ERROR_NAME;
  /** The request may have reached the API before this failed, so a write may have been applied. */
  readonly outcomeUnknown: boolean;
  /** The body broke the operation's schema, so the caller can say where the agent reads that schema. */
  readonly schemaViolation: boolean;

  constructor(
    message: string,
    {
      outcomeUnknown = false,
      schemaViolation = false,
      cause,
    }: {
      readonly outcomeUnknown?: boolean;
      readonly schemaViolation?: boolean;
      /** The failure behind the message, logged by the tool runner. */
      readonly cause?: unknown;
    } = {},
  ) {
    super(message, cause == null ? undefined : { cause });
    this.outcomeUnknown = outcomeUnknown;
    this.schemaViolation = schemaViolation;
  }
}

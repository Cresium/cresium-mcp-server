import { TOOL_ERROR_NAME } from "./constants.ts";

export class ToolError extends Error {
  override readonly name = TOOL_ERROR_NAME;
}

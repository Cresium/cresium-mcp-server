import { callOperation } from "../cresium/operation.ts";
import type { Operation, OperationCall } from "../cresium/types.ts";
import type { ToolContext } from "../tools/types.ts";

/** Runs one operation as the session's partner, logging how the call went. */
export function callApi(
  ctx: ToolContext,
  operation: Operation,
  call: OperationCall,
): Promise<unknown> {
  return callOperation(
    {
      session: ctx.session,
      signal: ctx.signal,
      onCall: (record) => {
        ctx.logger.info(record, "cresium api call");
      },
    },
    operation,
    call,
  );
}

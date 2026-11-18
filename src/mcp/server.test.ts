import { describe, expect, it } from "bun:test";

import { DEFAULT_MAX_REQUEST_BODY_SIZE } from "@modelcontextprotocol/server";

import { captureLogger } from "../../test/support/capture-logger.ts";
import { createMcpEndpoint } from "./server.ts";

const endpoint = createMcpEndpoint({
  tools: [],
  mode: "full",
  environment: "sandbox",
  apiBaseUrl: "http://localhost:9",
  timeoutMs: 1000,
  ensureConnected: () => Promise.resolve(),
  logger: captureLogger().logger,
});

describe("createMcpEndpoint", () => {
  it("answers a JSON body over the SDK's limit with the SDK's own 413", async () => {
    const response = await endpoint(
      new Request("http://localhost/sandbox", {
        method: "POST",
        headers: {
          "x-api-key": "key",
          "x-api-secret": "secret",
          "x-company-id": "44",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: `"${"x".repeat(DEFAULT_MAX_REQUEST_BODY_SIZE)}"`,
      }),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: `Payload Too Large: Request body must not exceed ${DEFAULT_MAX_REQUEST_BODY_SIZE} bytes`,
      },
      id: null,
    });
  });
});

import { createHmac } from "node:crypto";

import type { FakeCresium, FakeReply, ReceivedRequest } from "./types.ts";

/** A local stand-in for the V3 API that records requests and checks signatures the way mage does. */
export function startFakeCresium(secret: string): FakeCresium {
  const received: ReceivedRequest[] = [];
  let next: FakeReply = { status: 200, body: '{"data":true}' };
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      const raw = await request.text();
      // mage signs the re-serialized parsed body, so this mirrors `JSON.stringify(request.body)`.
      const signedBody = raw ? JSON.stringify(JSON.parse(raw)) : "";
      const timestamp = request.headers.get("x-timestamp") ?? "";
      const pathAndQuery = `${url.pathname}${url.search}`;
      const expected = createHmac("sha256", secret)
        .update(`${timestamp}|${request.method}|${pathAndQuery}|${signedBody}`)
        .digest("base64");
      received.push({
        method: request.method,
        url: pathAndQuery,
        headers: request.headers,
        body: raw,
        signatureValid: request.headers.get("x-signature") === expected,
      });
      return new Response(next.body, { status: next.status });
    },
  });
  return {
    baseUrl: `http://localhost:${server.port}`,
    received,
    reply: (reply) => {
      next = reply;
    },
    stop: () => server.stop(true),
  };
}

import { gzipSync } from "node:zlib";

import type { GzipUpstream, GzipUpstreamOptions } from "./types.ts";

const INFLATED_BYTES = 8 * 1024 * 1024;
const SMALL_ANSWER = '{"data":"sin comprimir"}';

/**
 * A server whose answer is a small gzip body that inflates to 8 MiB. One that honors Accept-Encoding sends
 * a small plain answer to a client that asks for identity; one that does not compresses whatever it is asked.
 */
export function startGzipUpstream({
  honorsAcceptEncoding,
}: GzipUpstreamOptions): GzipUpstream {
  const compressed = gzipSync(Buffer.alloc(INFLATED_BYTES, "a"), { level: 9 });
  const acceptEncodings: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const accepted = request.headers.get("accept-encoding") ?? "";
      acceptEncodings.push(accepted);
      // Without Accept-Encoding, HTTP lets the server pick any encoding.
      const wantsPlain = accepted !== "" && !accepted.includes("gzip");
      if (honorsAcceptEncoding && wantsPlain) return new Response(SMALL_ANSWER);
      return new Response(compressed, {
        headers: { "content-encoding": "gzip" },
      });
    },
  });
  return {
    baseUrl: `http://localhost:${server.port}`,
    compressedBytes: compressed.byteLength,
    smallAnswer: SMALL_ANSWER,
    acceptEncodings,
    stop: () => server.stop(true),
  };
}

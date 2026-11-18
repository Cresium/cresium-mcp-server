import type { EndlessUpstream } from "./types.ts";

const CHUNK_BYTES = 64 * 1024;

/** A server whose every answer is a body that never ends; it counts the bytes it produced and notices when the reader hangs up. */
export function startEndlessUpstream(
  headers: Record<string, string> = {},
): EndlessUpstream {
  const state = { sentBytes: 0, cancelled: false };
  const chunk = new Uint8Array(CHUNK_BYTES).fill("a".charCodeAt(0));
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      request.signal.addEventListener("abort", () => {
        state.cancelled = true;
      });
      return new Response(
        new ReadableStream<Uint8Array>({
          pull: async (controller) => {
            // Paced, so a reader that keeps reading would still be reading when the test gives up.
            await Bun.sleep(1);
            state.sentBytes += chunk.length;
            controller.enqueue(chunk);
          },
          cancel: () => {
            state.cancelled = true;
          },
        }),
        { headers },
      );
    },
  });
  return {
    baseUrl: `http://localhost:${server.port}`,
    state,
    stop: () => server.stop(true),
  };
}

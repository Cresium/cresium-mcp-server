import { describe, expect, it } from "bun:test";

import { readTextWithin } from "./body.ts";

function streamed(
  chunks: readonly string[],
  observe: { pulled: number; cancelled: boolean },
): Response {
  const encoder = new TextEncoder();
  let next = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull: (controller) => {
        observe.pulled += 1;
        const chunk = chunks[next];
        next += 1;
        if (chunk == null) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunk));
      },
      cancel: () => {
        observe.cancelled = true;
      },
    }),
  );
}

describe("readTextWithin", () => {
  it("returns the whole text when it fits, across chunks and multi-byte characters", async () => {
    const observe = { pulled: 0, cancelled: false };
    const text = await readTextWithin(
      streamed(["ni", "ñ", "o"], observe),
      10,
      new AbortController(),
    );
    expect(text).toBe("niño");
    expect(observe.cancelled).toBe(false);
  });

  it("accepts a body of exactly the limit", async () => {
    const observe = { pulled: 0, cancelled: false };
    expect(
      await readTextWithin(
        streamed(["abcd"], observe),
        4,
        new AbortController(),
      ),
    ).toBe("abcd");
  });

  it("returns an empty text for a response without body", async () => {
    const empty = new Response(null, { status: 204 });
    expect(await readTextWithin(empty, 4, new AbortController())).toBe("");
  });

  it("stops reading and cancels the stream as soon as the limit is crossed", async () => {
    const observe = { pulled: 0, cancelled: false };
    const chunks = Array.from({ length: 1000 }, () => "abcd");
    const hangUp = new AbortController();
    expect(
      await readTextWithin(streamed(chunks, observe), 10, hangUp),
    ).toBeUndefined();
    expect(observe.cancelled).toBe(true);
    expect(hangUp.signal.aborted).toBe(true);
    expect(observe.pulled).toBeLessThan(10);
  });

  it("does not read at all when the declared length is already too big", async () => {
    const observe = { pulled: 0, cancelled: false };
    const response = streamed(["abcd"], observe);
    response.headers.set("content-length", "5000");
    const hangUp = new AbortController();
    expect(await readTextWithin(response, 10, hangUp)).toBeUndefined();
    expect(hangUp.signal.aborted).toBe(true);
    expect(observe.pulled).toBeLessThanOrEqual(1);
    expect(observe.cancelled).toBe(true);
  });
});

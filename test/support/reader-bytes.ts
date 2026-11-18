import { spyOn } from "bun:test";

/**
 * Runs `work` and returns how many bytes every stream reader was handed meanwhile. Bun's fetch hands
 * the reader what it already inflated, so this is what a compressed answer cost in memory.
 */
export async function bytesHandedToReaders(
  work: () => Promise<unknown>,
): Promise<number> {
  const read = spyOn(ReadableStreamDefaultReader.prototype, "read");
  try {
    await work();
    let total = 0;
    for (const result of read.mock.results) {
      const chunk: unknown = await result.value;
      if (
        typeof chunk === "object" &&
        chunk &&
        "value" in chunk &&
        chunk.value instanceof Uint8Array
      ) {
        total += chunk.value.byteLength;
      }
    }
    return total;
  } finally {
    read.mockRestore();
  }
}

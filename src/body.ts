import { UPSTREAM_ANSWER_COMPRESSED } from "./constants.ts";
import { UserFacingError } from "./errors.ts";

/**
 * fetch that receives the answer as it travels. Bun inflates a compressed answer before any reader sees it,
 * whatever Accept-Encoding said, unless `decompress` is false; and with it false Bun sends no Accept-Encoding,
 * which lets the server compress. So both, and readTextWithin refuses an answer compressed anyway.
 */
export function fetchUncompressed(
  url: string,
  init: Omit<RequestInit, "headers"> & {
    readonly headers?: Readonly<Record<string, string>>;
  },
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...init.headers, "accept-encoding": "identity" },
    decompress: false,
  });
}

/**
 * The body of `response` as text, or undefined when it is longer than `maxBytes`. Past the limit it stops
 * reading, cancels the stream and aborts `hangUp`, which must be part of the request's signal: in Bun,
 * cancelling the stream alone leaves the connection open and the sender keeps sending. A compressed body
 * (from fetchUncompressed) is refused unread, with `outcomeUnknown` because a write was already sent.
 */
export async function readTextWithin(
  response: Response,
  maxBytes: number,
  hangUp: AbortController,
): Promise<string | undefined> {
  const encoding = response.headers.get("content-encoding") ?? "identity";
  if (encoding !== "identity") {
    await response.body?.cancel();
    hangUp.abort();
    throw new UserFacingError(UPSTREAM_ANSWER_COMPRESSED, {
      outcomeUnknown: true,
    });
  }
  const declared = Number(response.headers.get("content-length"));
  if (declared > maxBytes) {
    await response.body?.cancel();
    hangUp.abort();
    return;
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const result: {
      readonly done: boolean;
      readonly value: Uint8Array | undefined;
    } = await reader.read();
    if (result.done || !result.value) return text + decoder.decode();
    const { value } = result;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      hangUp.abort();
      return;
    }
    text += decoder.decode(value, { stream: true });
  }
}

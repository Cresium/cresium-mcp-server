/**
 * The body of `response` as text, or undefined when it is longer than `maxBytes`. Past the limit it stops
 * reading, cancels the stream and aborts `hangUp`, which must be part of the request's signal: in Bun,
 * cancelling the stream alone leaves the connection open and the sender keeps sending.
 */
export async function readTextWithin(
  response: Response,
  maxBytes: number,
  hangUp: AbortController,
): Promise<string | undefined> {
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

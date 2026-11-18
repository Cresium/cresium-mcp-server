import { createHash } from "node:crypto";

import type { ServerContext } from "@modelcontextprotocol/server";
import * as z from "zod";

import {
  CLIENT_CAPABILITIES_META_KEY,
  createRequestStateCodec,
  inputRequired,
  inputResponse,
} from "@modelcontextprotocol/server";

import type { PartnerSession } from "../partner/types.ts";
import {
  CONFIRMATION_INPUT_KEY,
  CONFIRMATION_TTL_SECONDS,
} from "./constants.ts";
import type {
  ConfirmationChannel,
  ConfirmationCodec,
  ConfirmationRequest,
  ConfirmationState,
  ConfirmationVerdict,
  ToolDef,
} from "./types.ts";

/**
 * Signs and verifies the state with the SDK's HMAC codec: a bad signature, an expiry or a state minted for
 * another partner is refused by the SDK before any handler runs. The partner is part of what the codec binds,
 * so a state cannot be replayed under another API key, company or environment.
 */
export function createConfirmationCodec(
  secret: string,
  { environment, credentials }: PartnerSession,
): ConfirmationCodec {
  return createRequestStateCodec<ConfirmationState>({
    key: secret,
    ttlSeconds: CONFIRMATION_TTL_SECONDS,
    bind: () =>
      [environment, credentials.companyId, credentials.apiKey].join("\0"),
  });
}

const declaredCapabilities = z.object({
  elicitation: z
    .object({ form: z.unknown().optional(), url: z.unknown().optional() })
    .optional(),
});

// The embedded elicitation is only legal when the request declares it; the SDK reads `elicitation: {}` as form support.
// Only a 2026-era request carries the envelope, so a 2025-era one is never asked.
function canAnswerForm({ mcpReq: { envelope } }: ServerContext): boolean {
  const declared: unknown = envelope
    ? Reflect.get(envelope, CLIENT_CAPABILITIES_META_KEY)
    : undefined;
  const parsed = declaredCapabilities.safeParse(declared);
  const elicitation = parsed.success ? parsed.data.elicitation : undefined;
  if (!elicitation) return false;
  return Boolean(elicitation.form) || !elicitation.url;
}

/**
 * How this request can be put to the person, or undefined when it cannot: no secret, a 2025-era request
 * (which has no input_required, and a per-request server cannot ask the client mid-call) or a client that did
 * not declare form elicitation. Those get exactly what they got before.
 */
export function confirmationChannel(
  codec: ConfirmationCodec | undefined,
  ctx: ServerContext,
): ConfirmationChannel | undefined {
  if (!codec || !canAnswerForm(ctx)) return;
  const answer = inputResponse(
    ctx.mcpReq.inputResponses,
    CONFIRMATION_INPUT_KEY,
  );
  return {
    seal: (binding) => codec.mint({ binding }, ctx),
    sealed: ctx.mcpReq.requestState<ConfirmationState>()?.binding,
    answer: answer.kind === "elicit" ? answer.action : undefined,
  };
}

function bindingOf(tool: ToolDef, { effect }: ConfirmationRequest): string {
  return createHash("sha256").update(`${tool.name}\0${effect}`).digest("hex");
}

/**
 * Whether the write may run. Only an accept that carries a verified state bound to this very call confirms;
 * an accept for any other call, or without state, asks again about this one. A decline or cancel never sends
 * anything, whatever call it was for.
 */
export async function judgeConfirmation(
  channel: ConfirmationChannel,
  tool: ToolDef,
  request: ConfirmationRequest,
): Promise<ConfirmationVerdict> {
  if (channel.answer === "decline" || channel.answer === "cancel") {
    return { kind: "declined" };
  }
  const binding = bindingOf(tool, request);
  if (channel.answer === "accept" && channel.sealed === binding) {
    return { kind: "confirmed" };
  }
  return {
    kind: "ask",
    result: inputRequired({
      inputRequests: {
        [CONFIRMATION_INPUT_KEY]: inputRequired.elicit({
          message: request.message,
          requestedSchema: { type: "object", properties: {} },
        }),
      },
      requestState: await channel.seal(binding),
    }),
  };
}

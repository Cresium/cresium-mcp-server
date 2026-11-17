import type { MINTLIFY_TOOLS } from "./constants.ts";

export type MintlifyTool = (typeof MINTLIFY_TOOLS)[keyof typeof MINTLIFY_TOOLS];

export interface MintlifyCall {
  readonly tool: MintlifyTool;
  readonly args: Readonly<Record<string, string>>;
}

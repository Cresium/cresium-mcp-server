import * as z from "zod";

import { LOG_LEVELS, LOOPBACK_HOSTNAMES } from "./constants.ts";
import type { Config } from "./types.ts";

function isHttpsOrLoopback(value: string): boolean {
  const url = new URL(value);
  return url.protocol === "https:" || LOOPBACK_HOSTNAMES.includes(url.hostname);
}

const secureUrl = z
  .url({ protocol: /^https?$/ })
  .refine(isHttpsOrLoopback, {
    message: "must use https unless it points at localhost",
  })
  .transform((value) => value.replace(/\/$/, ""));

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  MCP_BASE_URL: secureUrl,
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
});

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    baseUrl: e.MCP_BASE_URL,
    logLevel: e.LOG_LEVEL,
  };
}

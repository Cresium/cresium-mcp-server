import * as z from "zod";

import {
  CONFIRMATION_SECRET_MIN_LENGTH,
  DEFAULT_RATE_LIMIT_PER_MINUTE,
  LOG_LEVELS,
  LOOPBACK_HOSTNAMES,
} from "./constants.ts";
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
  CRESIUM_SANDBOX_API_URL: secureUrl,
  CRESIUM_PRODUCTION_API_URL: secureUrl,
  CRESIUM_DOCS_URL: secureUrl,
  TOOL_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_RATE_LIMIT_PER_MINUTE),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  // An empty value (a Doppler secret left blank) counts as not set.
  CONFIRMATION_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(CONFIRMATION_SECRET_MIN_LENGTH).optional(),
  ),
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
    apiUrls: {
      sandbox: e.CRESIUM_SANDBOX_API_URL,
      production: e.CRESIUM_PRODUCTION_API_URL,
    },
    docsUrl: e.CRESIUM_DOCS_URL,
    toolTimeoutMs: e.TOOL_TIMEOUT_MS,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    trustedProxyHops: e.TRUSTED_PROXY_HOPS,
    logLevel: e.LOG_LEVEL,
    confirmationSecret: e.CONFIRMATION_SECRET,
  };
}

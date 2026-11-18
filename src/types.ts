import type { LOG_LEVELS } from "./constants.ts";
import type { Environment } from "./partner/types.ts";

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  readonly port: number;
  readonly baseUrl: string;
  readonly apiUrls: Readonly<Record<Environment, string>>;
  readonly docsUrl: string;
  readonly toolTimeoutMs: number;
  /** Requests one client IP may make to the MCP routes each minute. */
  readonly rateLimitPerMinute: number;
  /** Proxies in front of this server whose X-Forwarded-For entry is believed; 0 uses the socket address. */
  readonly trustedProxyHops: number;
  readonly logLevel: LogLevel;
  /** Logged once at startup: settings that run but probably are not what the deploy meant. */
  readonly warnings: readonly string[];
}

import packageJson from "../package.json" with { type: "json" };

export const LOOPBACK_HOSTNAMES: readonly string[] = [
  "localhost",
  "127.0.0.1",
  "[::1]",
];

export const LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
] as const;

export const UNAUTHORIZED_STATUS = 401;

/** How this server names itself to MCP peers (clients and the docs server). */
export const SERVER_INFO = {
  name: packageJson.name,
  version: packageJson.version,
} as const;

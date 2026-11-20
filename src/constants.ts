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

export const BAD_REQUEST_STATUS = 400;
export const UNAUTHORIZED_STATUS = 401;

export const USER_FACING_ERROR_NAME = "UserFacingError";

/** How this server names itself to MCP peers (clients and the docs server). */
export const SERVER_INFO = {
  name: packageJson.name,
  title: "Cresium",
  websiteUrl: "https://docs.cresium.com",
  version: packageJson.version,
} as const;

/** Sent on every Cresium API call, so mage's logs tell MCP traffic from direct API traffic. */
export const USER_AGENT = `${SERVER_INFO.name}/${SERVER_INFO.version}`;

export const SERVICE_NAME = "cresium-mcp";

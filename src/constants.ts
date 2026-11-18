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
export const TOO_MANY_REQUESTS_STATUS = 429;

/**
 * One real agent session makes a handful of requests per tool call (initialize, tools/list, the call)
 * and bursts of parallel calls, so about 30 calls a minute is 100 to 150 requests. 300 leaves room for
 * two or three agents behind one office address and still stops a script sending thousands of signed
 * calls with made-up keys.
 */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 300;

/**
 * The most bytes read from one upstream answer (Cresium's API or a docs page); past it the read stops.
 * It is far above what any tool returns (MAX_RESULT_CHARS is at most about 200 KB as UTF-8), so a real
 * answer is never refused, and small enough that a pod serving concurrent calls holds a few MiB, not a
 * whole runaway body, in memory.
 */
export const MAX_UPSTREAM_BODY_BYTES = 2 * 1024 * 1024;

export const BYTES_PER_MIB = 1024 * 1024;

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

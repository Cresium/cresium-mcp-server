export const ENVIRONMENTS = ["sandbox", "production"] as const;

/** How each environment is named to the agent, so it knows when real money is involved. */
export const ENVIRONMENT_LABELS = {
  sandbox: "SANDBOX (pruebas, sin plata real)",
  production: "PRODUCCIÓN (datos y plata reales)",
} as const satisfies Record<(typeof ENVIRONMENTS)[number], string>;

export const CREDENTIAL_HEADERS = {
  apiKey: "x-api-key",
  secret: "x-api-secret",
  companyId: "x-company-id",
} as const;

export const VISIBLE_API_KEY_CHARS = 4;

const SECRET_HEADERS = [CREDENTIAL_HEADERS.apiKey, CREDENTIAL_HEADERS.secret];

/** Where a credential would sit if code logged the request headers, the credentials or the session. Nothing logs them today; the logger censors these paths as a second net. */
export const REDACTED_LOG_PATHS: readonly string[] = [
  ...SECRET_HEADERS.flatMap((header) => [
    `headers["${header}"]`,
    `*.headers["${header}"]`,
  ]),
  "secret",
  "*.secret",
  "*.*.secret",
  "*.*.*.secret",
  "apiKey",
  "*.apiKey",
  "*.*.apiKey",
  "*.*.*.apiKey",
];

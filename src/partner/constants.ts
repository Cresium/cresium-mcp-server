export const ENVIRONMENTS = ["sandbox", "production"] as const;

export const CREDENTIAL_HEADERS = {
  apiKey: "x-api-key",
  secret: "x-api-secret",
  companyId: "x-company-id",
} as const;

export const VISIBLE_API_KEY_CHARS = 4;

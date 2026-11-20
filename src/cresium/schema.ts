import * as z from "zod";

import { HTTP_METHODS } from "./constants.ts";

const operationParameterSchema = z
  .object({
    name: z.string(),
    in: z.enum(["path", "query"]),
    required: z.boolean(),
    description: z.string(),
    schema: z.record(z.string(), z.unknown()).readonly(),
  })
  .readonly();

/** One V3 endpoint, trimmed from Cresium/bible's OpenAPI by scripts/generate-spec.ts. */
export const operationSchema = z
  .object({
    /** `METHOD /path`, e.g. `GET /v3/balance/`. Agents pass it back to the read/write tools. */
    id: z.string(),
    method: z.enum(HTTP_METHODS),
    path: z.string(),
    summary: z.string(),
    description: z.string(),
    tags: z.array(z.string()).readonly(),
    parameters: z.array(operationParameterSchema).readonly(),
    /** JSON schema of the request body, or null when the endpoint takes none. */
    body: z.record(z.string(), z.unknown()).readonly().nullable(),
  })
  .readonly();

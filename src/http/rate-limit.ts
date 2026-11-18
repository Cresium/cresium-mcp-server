import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";

import { TOO_MANY_REQUESTS_STATUS } from "../constants.ts";
import type { Config } from "../types.ts";
import {
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMITED_ERROR,
  RATE_LIMITED_MESSAGE,
} from "./constants.ts";

/** Counts requests per client IP in this pod's memory. The IP comes from `req.ip`, which follows the app's `trust proxy` setting. */
export function createRateLimiter({
  rateLimitPerMinute,
}: Pick<Config, "rateLimitPerMinute">): RequestHandler {
  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: rateLimitPerMinute,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    statusCode: TOO_MANY_REQUESTS_STATUS,
    message: { error: RATE_LIMITED_ERROR, message: RATE_LIMITED_MESSAGE },
  });
}

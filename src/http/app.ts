import {
  hostHeaderValidation,
  originValidation,
} from "@modelcontextprotocol/express";
import type { ErrorRequestHandler, Express } from "express";
import express from "express";

import { LOOPBACK_HOSTNAMES } from "../constants.ts";
import type { AppDeps } from "./types.ts";

export function createApp({ config, logger }: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");

  // Before host validation: Kubernetes probes send the pod IP as Host.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  const hostname = new URL(config.baseUrl).hostname;
  const allowedHosts = LOOPBACK_HOSTNAMES.includes(hostname)
    ? [...LOOPBACK_HOSTNAMES]
    : [hostname];
  app.use(hostHeaderValidation(allowedHosts));
  app.use(originValidation(allowedHosts));

  // eslint-disable-next-line max-params -- Express recognizes error middleware by its four parameters.
  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    logger.error({ err: error }, "unhandled request error");
    if (!res.headersSent) res.status(500).json({ error: "internal_error" });
  };
  app.use(onError);

  return app;
}

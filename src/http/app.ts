import {
  hostHeaderValidation,
  originValidation,
} from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { ErrorRequestHandler, Express } from "express";
import express from "express";

import { createConnectionGuard } from "../api/connection.ts";
import { API_TOOLS } from "../api/tools.ts";
import { LOOPBACK_HOSTNAMES } from "../constants.ts";
import { createDocsTools } from "../docs/tools.ts";
import { ACCESS_MODES, MODE_PATH_SUFFIX } from "../mcp/constants.ts";
import { createMcpEndpoint } from "../mcp/server.ts";
import { ENVIRONMENTS } from "../partner/constants.ts";
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

  const ensureConnected = createConnectionGuard();
  const tools = [...API_TOOLS, ...createDocsTools(config.docsUrl)];
  for (const environment of ENVIRONMENTS) {
    for (const mode of ACCESS_MODES) {
      const mcp = createMcpEndpoint({
        tools,
        environment,
        mode,
        apiBaseUrl: config.apiUrls[environment],
        timeoutMs: config.toolTimeoutMs,
        ensureConnected,
        logger,
      });
      app.all(
        `/${environment}${MODE_PATH_SUFFIX[mode]}`,
        toNodeHandler({ fetch: mcp }),
      );
    }
  }

  // eslint-disable-next-line max-params -- Express recognizes error middleware by its four parameters.
  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    logger.error({ err: error }, "unhandled request error");
    if (!res.headersSent) res.status(500).json({ error: "internal_error" });
  };
  app.use(onError);

  return app;
}

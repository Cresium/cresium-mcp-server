import type { Logger } from "pino";

import type { Config } from "../types.ts";

export interface AppDeps {
  readonly config: Config;
  readonly logger: Logger;
}

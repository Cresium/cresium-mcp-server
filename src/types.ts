import type { LOG_LEVELS } from "./constants.ts";
import type { Environment } from "./partner/types.ts";

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  readonly port: number;
  readonly baseUrl: string;
  readonly apiUrls: Readonly<Record<Environment, string>>;
  readonly docsUrl: string;
  readonly toolTimeoutMs: number;
  readonly logLevel: LogLevel;
}

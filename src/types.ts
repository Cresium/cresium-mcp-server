import type { LOG_LEVELS } from "./constants.ts";

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface Config {
  readonly port: number;
  readonly baseUrl: string;
  readonly logLevel: LogLevel;
}

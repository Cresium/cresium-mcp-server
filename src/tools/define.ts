import type { z } from "zod";

import type { ToolDef } from "./types.ts";

export function defineTool<Shape extends z.ZodRawShape>(
  def: ToolDef<Shape>,
): ToolDef<Shape> {
  return def;
}

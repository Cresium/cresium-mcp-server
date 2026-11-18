import * as z from "zod";

export const operationCallSchema = z.object({
  pathParams: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .default({})
    .describe('Parámetros del path, por nombre. Ejemplo: { "id": 123 }.'),
  query: z
    .record(
      z.string(),
      z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.union([z.string(), z.number()])),
      ]),
    )
    .default({})
    .describe("Parámetros de query, por nombre. Las listas van como array."),
  // mage signs "" for any falsy body, so only objects and arrays can be signed reliably.
  body: z
    .union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
    .optional()
    .describe("Body JSON del pedido, según el schema que devuelve search_api."),
});

export const NO_OPERATION_INPUT = operationCallSchema.parse({});

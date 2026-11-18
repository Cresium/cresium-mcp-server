import { describe, expect, it } from "bun:test";

import { projectFields } from "./project.ts";

const TX = {
  id: 1,
  amount: "10",
  status: "OK",
  counterparty: { name: "Ana", cvu: "000" },
  lines: [
    { sku: "a", qty: 1 },
    { sku: "b", qty: 2 },
  ],
};

interface Case {
  readonly name: string;
  readonly answer: unknown;
  readonly fields: readonly string[];
  readonly value: unknown;
  readonly unmatched: readonly string[];
}

const CASES: Case[] = [
  {
    name: "an object in the data envelope",
    answer: { data: TX },
    fields: ["id", "status"],
    value: { data: { id: 1, status: "OK" } },
    unmatched: [],
  },
  {
    name: "an object without envelope",
    answer: TX,
    fields: ["id"],
    value: { id: 1 },
    unmatched: [],
  },
  {
    name: "a list in the envelope, per element",
    answer: { data: [TX, { ...TX, id: 2 }] },
    fields: ["id"],
    value: { data: [{ id: 1 }, { id: 2 }] },
    unmatched: [],
  },
  {
    name: "an object holding one list keeps the pagination fields",
    answer: { data: { items: [TX, TX], cursor: "abc", total: 40 } },
    fields: ["id", "amount"],
    value: {
      data: {
        items: [
          { id: 1, amount: "10" },
          { id: 1, amount: "10" },
        ],
        cursor: "abc",
        total: 40,
      },
    },
    unmatched: [],
  },
  {
    name: "the envelope's other keys",
    answer: { data: [TX], meta: { page: 1 } },
    fields: ["id"],
    value: { data: [{ id: 1 }], meta: { page: 1 } },
    unmatched: [],
  },
  {
    name: "a nested path",
    answer: { data: [TX] },
    fields: ["counterparty.name"],
    value: { data: [{ counterparty: { name: "Ana" } }] },
    unmatched: [],
  },
  {
    name: "two paths into the same object merge",
    answer: { data: TX },
    fields: ["counterparty.name", "counterparty.cvu", "id"],
    value: { data: { id: 1, counterparty: { name: "Ana", cvu: "000" } } },
    unmatched: [],
  },
  {
    name: "a path through a list inside each item",
    answer: { data: [TX] },
    fields: ["id", "lines.qty"],
    value: { data: [{ id: 1, lines: [{ qty: 1 }, { qty: 2 }] }] },
    unmatched: [],
  },
  {
    name: "falsy values are matches",
    answer: { data: [{ n: 0, ok: false, s: "", z: null, x: 1 }] },
    fields: ["n", "ok", "s", "z"],
    value: { data: [{ n: 0, ok: false, s: "", z: null }] },
    unmatched: [],
  },
  {
    name: "a path found in some elements only is not reported",
    answer: { data: [{ id: 1, note: "x" }, { id: 2 }] },
    fields: ["note"],
    value: { data: [{ note: "x" }, {}] },
    unmatched: [],
  },
  {
    name: "a path found nowhere is reported and the rest kept",
    answer: { data: [TX] },
    fields: ["id", "nope", "counterparty.nope"],
    value: { data: [{ id: 1 }] },
    unmatched: ["nope", "counterparty.nope"],
  },
  {
    name: "an empty list stays empty without reporting anything",
    answer: { data: { items: [], cursor: null } },
    fields: ["id"],
    value: { data: { items: [], cursor: null } },
    unmatched: [],
  },
  {
    name: "an object with one list is one item when a path points at the object itself",
    answer: { data: TX },
    fields: ["id", "lines.sku"],
    value: { data: { id: 1, lines: [{ sku: "a" }, { sku: "b" }] } },
    unmatched: [],
  },
  {
    name: "an object with two lists is projected as one object",
    answer: { data: { a: [{ x: 1 }], b: [{ x: 2 }], n: 1 } },
    fields: ["n"],
    value: { data: { n: 1 } },
    unmatched: [],
  },
  {
    name: "an answer that is no object or list is left as it is",
    answer: { data: true },
    fields: ["id"],
    value: { data: true },
    unmatched: ["id"],
  },
  {
    name: "a non-JSON text answer",
    answer: "Bad Gateway",
    fields: ["id"],
    value: "Bad Gateway",
    unmatched: [],
  },
  {
    name: "a path that names an inherited property",
    answer: { data: { id: 1 } },
    fields: ["constructor", "__proto__"],
    value: { data: {} },
    unmatched: ["constructor", "__proto__"],
  },
];

describe("projectFields", () => {
  it.each(CASES)("$name", ({ answer, fields, value, unmatched }) => {
    expect(projectFields(answer, fields)).toEqual({ value, unmatched });
  });

  it("does not change the answer it was given", () => {
    const answer = { data: [TX] };
    const copy = structuredClone(answer);
    projectFields(answer, ["id"]);
    expect(answer).toEqual(copy);
  });
});

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";

import type { Client, ClientOptions } from "@modelcontextprotocol/client";
import {
  Client as McpClient,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { isInputRequiredResult } from "@modelcontextprotocol/server";

import { CONFIRMATION_TTL_SECONDS } from "../src/tools/constants.ts";
import { callTool } from "./support/call-tool.ts";
import { startFakeCresium } from "./support/fake-cresium.ts";
import { startApp } from "./support/start-app.ts";
import type {
  FakeCresium,
  Route,
  RunningApp,
  ToolText,
} from "./support/types.ts";

const API_SECRET = "confirm-writes-secret";
const CONFIRMATION_SECRET = "c".repeat(40);
const HEADERS = {
  "x-api-key": "0123456789abcdef0123456789abc017",
  "x-api-secret": API_SECRET,
  "x-company-id": "44",
};
const OTHER_COMPANY = { ...HEADERS, "x-company-id": "45" };
const CAN_ASK: ClientOptions = {
  capabilities: { elicitation: { form: {} } },
  versionNegotiation: { mode: "auto" },
};
const MANUAL: ClientOptions = {
  ...CAN_ASK,
  inputRequired: { autoFulfill: false },
};
const CVU = { operation: "POST /v3/deposit-address/cvu", body: { value: "x" } };
const DEPOSIT = {
  operation: "POST /v3/sandbox/deposit",
  body: { cvu: "1", amount: "5" },
};
const NOT_CONFIRMED = "no confirmó";
const MESSAGE_KEY = "confirmar";
const INVALID_STATE = "Invalid or expired requestState";

let upstream: FakeCresium;
let app: RunningApp;
let appWithoutSecret: RunningApp;
const stoppers: (() => void)[] = [];

type Answer = "accept" | "decline" | "cancel";

/** A client that answers every question with `answer` and remembers what it was asked. */
async function answering(
  answer: Answer,
  where: {
    route?: Route;
    options?: ClientOptions;
    on?: RunningApp;
  } = {},
): Promise<{ client: Client; asked: string[] }> {
  const { route = "production", options = CAN_ASK, on = app } = where;
  const client = await on.connect(route, HEADERS, options);
  const asked: string[] = [];
  client.setRequestHandler("elicitation/create", (request) => {
    asked.push(request.params.message);
    return { action: answer };
  });
  return { client, asked };
}

async function failure(attempt: Promise<unknown>): Promise<string> {
  try {
    await attempt;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "did not fail";
}

function sent(): string[] {
  return upstream.received.map(({ method, url }) => `${method} ${url}`);
}

/** The state a client was handed with the question, for a test that retries by hand. */
async function firstAsk(
  client: Client,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await client.callTool(
    { name: "write_api", arguments: args },
    { allowInputRequired: true },
  );
  if (!isInputRequiredResult(result) || !result.requestState) {
    throw new Error("expected a question with a state");
  }
  return result.requestState;
}

async function retry(
  client: Client,
  args: Record<string, unknown>,
  carrying: { state?: string; action?: Answer } = {},
): Promise<ToolText | "asked"> {
  const { state: requestState, action = "accept" } = carrying;
  // The client's types do not list the retry's fields, which it sends as given.
  const params = {
    name: "write_api",
    arguments: args,
    inputResponses: { [MESSAGE_KEY]: { action } },
    ...(requestState ? { requestState } : {}),
  };
  const result = await client.callTool(params, { allowInputRequired: true });
  if (isInputRequiredResult(result)) return "asked";
  return {
    isError: result.isError === true,
    text: result.content.map((b) => (b.type === "text" ? b.text : "")).join(""),
  };
}

beforeAll(async () => {
  upstream = startFakeCresium(API_SECRET);
  const urls = {
    sandbox: upstream.baseUrl,
    production: upstream.baseUrl,
    docs: "http://localhost:9",
  };
  app = await startApp(urls, { CONFIRMATION_SECRET });
  appWithoutSecret = await startApp(urls);
});

afterAll(async () => {
  app.stop();
  appWithoutSecret.stop();
  for (const stop of stoppers) stop();
  await upstream.stop();
});

beforeEach(() => {
  upstream.received.length = 0;
  upstream.reply({ status: 200, body: '{"data":{"ok":true}}' });
});

afterEach(() => {
  setSystemTime();
});

describe("a production write put to the person", () => {
  it("runs exactly once, with the signed bytes, after the person accepts, and shows them what it sends", async () => {
    const { client, asked } = await answering("accept");
    const result = await callTool(client, "write_api", DEPOSIT);
    expect(result.isError).toBe(false);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("PRODUCCIÓN");
    expect(asked[0]).toContain("POST");
    expect(asked[0]).toContain(`${upstream.baseUrl}/v3/sandbox/deposit`);
    // The body as it goes out after coercion: "5" became 5.
    expect(asked[0]).toContain('{"cvu":"1","amount":5}');
    expect(upstream.received).toHaveLength(1);
    expect(upstream.received[0]).toMatchObject({
      method: "POST",
      url: "/v3/sandbox/deposit",
      body: '{"cvu":"1","amount":5}',
      signatureValid: true,
    });
    await client.close();
  });

  it("also asks a client that declares elicitation without naming a mode, which the protocol reads as forms", async () => {
    const { client, asked } = await answering("decline", {
      options: {
        ...CAN_ASK,
        capabilities: { elicitation: {} },
      },
    });
    await callTool(client, "write_api", CVU);
    expect(asked).toHaveLength(1);
    expect(upstream.received).toHaveLength(0);
    await client.close();
  });

  it.each(["decline", "cancel"] as const)(
    "sends nothing when the person answers %s, and says so",
    async (answer) => {
      const { client, asked } = await answering(answer);
      const result = await callTool(client, "write_api", CVU);
      expect(asked).toHaveLength(1);
      expect(upstream.received).toHaveLength(0);
      expect(result.isError).toBe(true);
      expect(result.text).toContain(NOT_CONFIRMED);
      expect(result.text).toContain("no se envió nada");
      expect(result.text).not.toContain("pudo");
      await client.close();
    },
  );

  it("summarizes a very large body with its size instead of dumping it", async () => {
    const { client, asked } = await answering("decline");
    await callTool(client, "write_api", {
      operation: CVU.operation,
      body: { value: "a".repeat(20_000) },
    });
    expect(asked[0]?.length).toBeLessThan(2500);
    expect(asked[0]).toContain("de 20000 caracteres");
    await client.close();
  });

  it("shows the amount and the destination after a long description, and sends the full body once accepted", async () => {
    const { client, asked } = await answering("accept");
    const body = {
      description: "Pago de honorarios mensuales según contrato. ".repeat(40),
      toId: 777001,
      amount: "9999999",
      currencyCode: "ARS",
    };
    const result = await callTool(client, "write_api", {
      operation: "POST /v3/transaction/preview",
      body,
    });
    expect(result.isError).toBe(false);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('"toId":777001');
    expect(asked[0]).toContain('"amount":"9999999"');
    expect(asked[0]).not.toContain(body.description);
    expect(upstream.received).toHaveLength(1);
    expect(upstream.received[0]?.body).toBe(JSON.stringify(body));
    await client.close();
  });

  it("refuses, without asking or sending, a call too large to show", async () => {
    const { client, asked } = await answering("accept");
    const invoices = Array.from({ length: 5_000 }, (_, index) => ({
      amount: index + 1,
      payerNationalIdentifier: "20123456789",
      payerName: "Ana",
      status: "PENDING",
    }));
    const result = await callTool(client, "write_api", {
      operation: "POST /v3/invoice/",
      body: invoices,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("demasiado grande");
    expect(result.text).toContain("no se envió nada");
    expect(result.text).not.toContain("pudo");
    expect(asked).toHaveLength(0);
    expect(upstream.received).toHaveLength(0);
    await client.close();
  });

  it("warns the person that a write without body acts on data it cannot show", async () => {
    const { client, asked } = await answering("decline");
    await callTool(client, "write_api", {
      operation: "PUT /v3/transaction/confirm/{id}",
      pathParams: { id: 98765 },
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("/v3/transaction/confirm/98765");
    expect(asked[0]).toContain("no lleva body");
    expect(upstream.received).toHaveLength(0);
    await client.close();
  });

  it("answers a call the API would refuse as it does without confirmation, before asking", async () => {
    const { client, asked } = await answering("accept");
    const result = await callTool(client, "write_api", {
      operation: CVU.operation,
      body: { nope: 1 },
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Body inválido");
    expect(asked).toHaveLength(0);
    expect(upstream.received).toHaveLength(0);
    await client.close();
  });

  it("never logs the confirmation secret", () => {
    expect(app.logLines.join("")).not.toContain(CONFIRMATION_SECRET);
  });
});

describe("what never asks", () => {
  it("does not ask in sandbox", async () => {
    const { client, asked } = await answering("decline", { route: "sandbox" });
    const result = await callTool(client, "write_api", CVU);
    expect(result.isError).toBe(false);
    expect(asked).toHaveLength(0);
    expect(upstream.received).toHaveLength(1);
    await client.close();
  });

  it("does not ask for a dry run in production", async () => {
    const { client, asked } = await answering("decline");
    const result = await callTool(client, "write_api", {
      ...CVU,
      dryRun: true,
    });
    expect(result.text).toContain('"dryRun":true');
    expect(asked).toHaveLength(0);
    expect(upstream.received).toHaveLength(0);
    await client.close();
  });

  it("does not ask for a read in production", async () => {
    const { client, asked } = await answering("decline");
    const result = await callTool(client, "read_api", {
      operation: "GET /v3/deposit-address/",
    });
    expect(result.isError).toBe(false);
    expect(asked).toHaveLength(0);
    await client.close();
  });

  it("gives a 2025-era client, even one that declares elicitation, what it always got", async () => {
    const { client, asked } = await answering("decline", {
      options: {
        capabilities: { elicitation: { form: {} } },
      },
    });
    const result = await callTool(client, "write_api", CVU);
    expect(result.isError).toBe(false);
    expect(asked).toHaveLength(0);
    expect(sent()).toEqual(["POST /v3/deposit-address/cvu"]);
    await client.close();
  });

  it("gives a 2026-era client that cannot answer what it always got", async () => {
    const client = await app.connect("production", HEADERS, {
      versionNegotiation: { mode: "auto" },
    });
    const result = await callTool(client, "write_api", CVU);
    expect(result.isError).toBe(false);
    expect(sent()).toEqual(["POST /v3/deposit-address/cvu"]);
    await client.close();
  });

  it("runs every write as before when no secret is configured", async () => {
    const { client, asked } = await answering("decline", {
      on: appWithoutSecret,
    });
    const result = await callTool(client, "write_api", CVU);
    expect(result.isError).toBe(false);
    expect(asked).toHaveLength(0);
    expect(sent()).toEqual(["POST /v3/deposit-address/cvu"]);
    await client.close();
  });
});

describe("what the confirmation is bound to", () => {
  it("runs the retry that carries the state it was given", async () => {
    const client = await app.connect("production", HEADERS, MANUAL);
    const state = await firstAsk(client, CVU);
    expect(upstream.received).toHaveLength(0);
    const result = await retry(client, CVU, { state });
    expect(result).toMatchObject({ isError: false });
    expect(sent()).toEqual(["POST /v3/deposit-address/cvu"]);
    await client.close();
  });

  it("asks again, and sends nothing, when the retry has other arguments", async () => {
    const client = await app.connect("production", HEADERS, MANUAL);
    const state = await firstAsk(client, CVU);
    const other = { ...CVU, body: { value: "y" } };
    expect(await retry(client, other, { state })).toBe("asked");
    const otherOperation = {
      operation: "DELETE /v3/deposit-address/{address}",
      pathParams: { address: "1234567890123456789012" },
    };
    expect(await retry(client, otherOperation, { state })).toBe("asked");
    expect(upstream.received).toHaveLength(0);
    await client.close();
  });

  it("asks again when an accept arrives without any state", async () => {
    const client = await app.connect("production", HEADERS, MANUAL);
    expect(await retry(client, CVU)).toBe("asked");
    expect(upstream.received).toHaveLength(0);
    await client.close();
  });

  it("refuses a state that was altered", async () => {
    const client = await app.connect("production", HEADERS, MANUAL);
    const state = await firstAsk(client, CVU);
    const last = state.at(-1) === "A" ? "B" : "A";
    expect(
      await failure(
        retry(client, CVU, { state: `${state.slice(0, -1)}${last}` }),
      ),
    ).toContain(INVALID_STATE);
    expect(
      await failure(retry(client, CVU, { state: "v1.e30.AAAA" })),
    ).toContain(INVALID_STATE);
    expect(upstream.received).toHaveLength(0);
    await client.close();
  });

  it("refuses a state minted for another company", async () => {
    const mine = await app.connect("production", HEADERS, MANUAL);
    const state = await firstAsk(mine, CVU);
    const theirs = await app.connect("production", OTHER_COMPANY, MANUAL);
    expect(await failure(retry(theirs, CVU, { state }))).toContain(
      INVALID_STATE,
    );
    expect(upstream.received).toHaveLength(0);
    await mine.close();
    await theirs.close();
  });

  it("refuses a state minted with another server secret", async () => {
    const otherPod = await startApp(
      {
        sandbox: upstream.baseUrl,
        production: upstream.baseUrl,
        docs: "http://localhost:9",
      },
      { CONFIRMATION_SECRET: "d".repeat(40) },
    );
    stoppers.push(() => {
      otherPod.stop();
    });
    const there = await otherPod.connect("production", HEADERS, MANUAL);
    const state = await firstAsk(there, CVU);
    const here = await app.connect("production", HEADERS, MANUAL);
    expect(await failure(retry(here, CVU, { state }))).toContain(INVALID_STATE);
    expect(upstream.received).toHaveLength(0);
    await there.close();
    await here.close();
  });

  it("accepts a state minted by another pod that shares the secret", async () => {
    const otherPod = await startApp(
      {
        sandbox: upstream.baseUrl,
        production: upstream.baseUrl,
        docs: "http://localhost:9",
      },
      { CONFIRMATION_SECRET },
    );
    stoppers.push(() => {
      otherPod.stop();
    });
    const there = await otherPod.connect("production", HEADERS, MANUAL);
    const state = await firstAsk(there, CVU);
    const here = await app.connect("production", HEADERS, MANUAL);
    expect(await retry(here, CVU, { state })).toMatchObject({ isError: false });
    expect(upstream.received).toHaveLength(1);
    await there.close();
    await here.close();
  });

  it("refuses a state after it expired", async () => {
    const client = await app.connect("production", HEADERS, MANUAL);
    const state = await firstAsk(client, CVU);
    setSystemTime(Date.now() + (CONFIRMATION_TTL_SECONDS + 5) * 1000);
    expect(await failure(retry(client, CVU, { state }))).toContain(
      INVALID_STATE,
    );
    expect(upstream.received).toHaveLength(0);
    await client.close();
  });

  it("sends nothing on a decline, even one that carries a valid state", async () => {
    const client = await app.connect("production", HEADERS, MANUAL);
    const state = await firstAsk(client, CVU);
    const result = await retry(client, CVU, { state, action: "decline" });
    expect(result).toMatchObject({ isError: true });
    expect(upstream.received).toHaveLength(0);
    await client.close();
  });
});

describe("the limits that surround a retry", () => {
  it("refuses a batch that carries a valid, accepted retry", async () => {
    const client = await app.connect("production", HEADERS, MANUAL);
    const state = await firstAsk(client, CVU);
    const response = await fetch(`${app.url}/production`, {
      method: "POST",
      headers: {
        ...HEADERS,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify([
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "write_api",
            arguments: CVU,
            inputResponses: { [MESSAGE_KEY]: { action: "accept" } },
            requestState: state,
          },
        },
      ]),
    });
    expect(response.status).toBe(400);
    expect(upstream.received).toHaveLength(0);
    await client.close();
  });

  it("counts the retry against the per-IP limit", async () => {
    let requests = 0;
    async function flow(limit: string): Promise<unknown> {
      const limited = await startApp(
        {
          sandbox: upstream.baseUrl,
          production: upstream.baseUrl,
          docs: "http://localhost:9",
        },
        { CONFIRMATION_SECRET, RATE_LIMIT_PER_MINUTE: limit },
      );
      stoppers.push(() => {
        limited.stop();
      });
      requests = 0;
      const client = new McpClient(
        { name: "limit-test", version: "0" },
        CAN_ASK,
      );
      client.setRequestHandler("elicitation/create", () => ({
        action: "accept",
      }));
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL(`${limited.url}/production`),
          {
            requestInit: { headers: HEADERS },
            fetch: (input, init) => {
              requests += 1;
              return fetch(input, init);
            },
          },
        ),
      );
      return await callTool(client, "write_api", CVU).catch(
        (error: unknown) => error,
      );
    }
    await flow("100000");
    const total = requests;
    expect(upstream.received).toHaveLength(1);
    upstream.received.length = 0;
    const refused = await flow(String(total - 1));
    expect(refused).toBeInstanceOf(Error);
    expect(upstream.received).toHaveLength(0);
  });
});

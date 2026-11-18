<p align="center">
  <img src="https://d3gfub3l7gkyvv.cloudfront.net/landingImages/logo/cresium_primary.png" alt="Cresium" width="300" />
</p>

# Cresium MCP Server

A remote MCP (Model Context Protocol) server for the [Cresium](https://cresium.app) Partner API (V3) and its docs. Paste a URL into your AI agent, add your API key in three headers, and the agent can read the docs and call every V3 endpoint. There is nothing to clone or build.

| URL                                  | Calls                             |
| ------------------------------------ | --------------------------------- |
| `https://mcp.cresium.app/sandbox`    | `https://api.develop.cresium.app` |
| `https://mcp.cresium.app/production` | `https://api.cresium.app`         |

The MCP can do anything your API key can do through the API, in both environments. Use a sandbox key on `/sandbox` and a production key on `/production`.

## Connect

You need your partner **API key**, **secret** and **company ID** from the Cresium Dashboard.

### Claude Code

```bash
claude mcp add --transport http cresium https://mcp.cresium.app/sandbox \
  --header "x-api-key: YOUR_API_KEY" \
  --header "x-api-secret: YOUR_SECRET" \
  --header "x-company-id: YOUR_COMPANY_ID"
```

### Cursor (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "cresium": {
      "url": "https://mcp.cresium.app/sandbox",
      "headers": {
        "x-api-key": "YOUR_API_KEY",
        "x-api-secret": "YOUR_SECRET",
        "x-company-id": "YOUR_COMPANY_ID"
      }
    }
  }
}
```

### Cursor and VS Code install links

These open the editor with the sandbox server added. The headers carry placeholders (`YOUR_API_KEY`, `YOUR_SECRET`, `YOUR_COMPANY_ID`): replace them in the editor's MCP settings with your own values before connecting, and never paste real keys into a link.

- [Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=cresium&config=eyJ1cmwiOiJodHRwczovL21jcC5jcmVzaXVtLmFwcC9zYW5kYm94IiwiaGVhZGVycyI6eyJ4LWFwaS1rZXkiOiJZT1VSX0FQSV9LRVkiLCJ4LWFwaS1zZWNyZXQiOiJZT1VSX1NFQ1JFVCIsIngtY29tcGFueS1pZCI6IllPVVJfQ09NUEFOWV9JRCJ9fQ%3D%3D)
- [Add to VS Code](vscode:mcp/install?%7B%22name%22%3A%22cresium%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.cresium.app%2Fsandbox%22%2C%22headers%22%3A%7B%22x-api-key%22%3A%22YOUR_API_KEY%22%2C%22x-api-secret%22%3A%22YOUR_SECRET%22%2C%22x-company-id%22%3A%22YOUR_COMPANY_ID%22%7D%7D)

### Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.cresium]
url = "https://mcp.cresium.app/sandbox"
http_headers = { "x-api-key" = "YOUR_API_KEY", "x-api-secret" = "YOUR_SECRET", "x-company-id" = "YOUR_COMPANY_ID" }
```

Claude.ai and ChatGPT on the web are not supported: they connect through OAuth and cannot send these headers.

## Read-only connection

Add `/read-only` to either path (`https://mcp.cresium.app/sandbox/read-only`, `https://mcp.cresium.app/production/read-only`) to give an analyst or a support agent a connection that cannot write. It is the same server with the same headers, but every tool that changes something (`write_api`, `send_docs_feedback`) is not offered, the instructions say so and give no advice about writing, and `integrar_cvus_dedicados` is not offered because it creates data; `depurar_firma` is, without `write_api`. Calling a write tool by name answers "Tool write_api not found", and `read_api` still refuses write operations, saying the connection is read-only; no text on that connection names a tool it does not offer. To get writes, connect to the path without `/read-only`. There is no switch: the default paths are unchanged, and the variants are not listed in `server.json`, because a registry entry cannot tell two URLs apart by purpose.

## Rate limit per IP

Each client IP may make 300 requests a minute to the MCP paths (`/sandbox`, `/production` and their `/read-only` variants share one budget); `/health` is never limited. A real agent session makes a few requests per tool call (initialize, list the tools, the call) and sometimes a burst of parallel calls, so one busy session is about 100 to 150 requests a minute, and 300 leaves room for a few agents behind the same office address. Past the limit the server answers `429` with a `Retry-After` header (seconds), the standard `RateLimit` headers and a JSON body `{ "error": "rate_limited", "message": ... }`, before it reads the credentials or the body, so a flood of made-up keys costs one counter increment, not a signed call to Cresium.

| Variable                | Default | Meaning                                                                         |
| ----------------------- | ------- | ------------------------------------------------------------------------------- |
| `RATE_LIMIT_PER_MINUTE` | `300`   | Requests per minute per client IP.                                              |
| `TRUSTED_PROXY_HOPS`    | `0`     | How many proxies sit between the internet and this server (ingress, CDN, etc.). |

The server has to know which IP is the caller's. Behind a proxy, the socket address is the proxy's, and the real caller's address arrives in the `X-Forwarded-For` header, which each proxy extends with the address it saw. `TRUSTED_PROXY_HOPS` says how many of the rightmost entries were added by your own proxies and can be believed; with `0` the header is ignored and the socket address is used. Set it to the real number of proxies, because a wrong number is dangerous both ways:

- Too low (for example `0` behind the ingress): every request appears to come from the ingress, so all partners share one budget of 300 a minute, and one noisy partner locks out the rest.
- Too high (for example `2` with one proxy): the server believes an entry the caller wrote. Anyone can send `X-Forwarded-For: 1.2.3.4` with a new fake address on each request and never reach the limit.

The deploy must set it (in production the server logs a warning at startup while it is `0`): count the proxies a request crosses before reaching the pod, and confirm by sending one request and counting the addresses your own proxies appended to `X-Forwarded-For`.

The count lives in memory and per pod: with N pods a client can make up to N times the limit, and a restart resets it. To limit before traffic reaches the pods, or across them, do it in the ingress instead. There is no switch to turn it off; set `RATE_LIMIT_PER_MINUTE` high if you must.

## Tools

| Tool                 | Does                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `check_connection`   | Proves your credentials work and says which environment you are on. On an authentication failure it names the header to fix. |
| `search_api`         | Finds V3 operations by keyword, in Spanish or English. With no query it lists every operation with its summary.              |
| `read_api`           | Runs a `GET` operation, for example `{ "operation": "GET /v3/balance/wallets" }`. Marked read-only.                          |
| `write_api`          | Runs any operation that is not a `GET`. Not read-only, so your agent asks before running it.                                 |
| `search_docs`        | Searches docs.cresium.com and returns the first results, shortened.                                                          |
| `read_doc_page`      | Reads one docs page as Markdown.                                                                                             |
| `send_docs_feedback` | Reports a wrong or missing docs page to the Cresium team.                                                                    |

The docs tools also need valid credentials: the server checks them against Cresium before it forwards the call.

`POST /v3/invoice/read` is not available because it uploads files from your disk. Call it through the API directly.

### Dry run

`read_api` and `write_api` accept `"dryRun": true`. The server then sends nothing and returns the exact request: method, full URL, body, and `signedText`, the text your own code must sign. Use it to see a write before it runs, or to find why your code gets `Invalid signature`.

### Prompts

Your agent's prompt menu offers two ready-made tasks:

| Prompt                    | Does                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `integrar_cvus_dedicados` | Runs the dedicated CVU flow in sandbox, then writes the signing client and the webhook in your project. |
| `depurar_firma`           | Compares the request your code signs with the one this server signs and shows the difference.           |

### Lean results

`read_api` takes an optional `fields` list of dot paths, so a listing returns only what the agent reads. Paths apply to each item of the answer's `data` (a list, or an object holding one list, as `GET /v3/transaction/search` answers); pagination fields and the rest of the envelope are kept. A path may be nested (`counterparty.name`) or go through a list inside an item (`lines.qty`). A path that matches nothing in any item is named in a note after the JSON, never an error. An error answer from Cresium and a non-JSON answer are never changed. There is no switch: leave `fields` out for the full answer.

```json
{
  "operation": "GET /v3/transaction/search",
  "query": { "pageSize": 5 },
  "fields": ["id", "amount", "counterparty.name"]
}
```

### Size limits

No tool returns more than 50,000 characters of text (about a third of the roughly 150,000 characters claude.ai accepts). A longer result, an error message included, is cut and ends with a note that says how many characters were dropped, that the text is incomplete (a cut JSON is no longer valid JSON) and how to ask for less: `pageSize`, filters and `fields` for `read_api`, a more specific search or one page for the docs. A full page of 100 transactions fits. The server also stops reading Cresium's answer, and a docs page, after 2 MiB: it hangs up and tells the agent, and for a write it says the write was sent and may have been applied. The 2 MiB are counted as the bytes arrive, so the server asks for uncompressed answers (`accept-encoding: identity`, and Bun's automatic decompression off); an answer compressed anyway is refused unread instead of being inflated. Both limits are constants (`MAX_RESULT_CHARS`, `MAX_UPSTREAM_BODY_BYTES`), not settings. Docs search and feedback go through Mintlify's own MCP client and are not bounded this way.

### Errors

The server rejects a top-level body field the API does not declare, so a typo such as `ammount` fails with the list of valid fields instead of being ignored.

## How it works

```
agent ──POST /sandbox── headers: x-api-key · x-api-secret · x-company-id
  │
  ▼
cresium-mcp  (src/http/app.ts)
  ├─ partner/credentials.ts   reads the 3 headers; 401 if one is missing
  ├─ mcp/server.ts            one MCP server per request, bound to the environment
  ├─ api/tools.ts             check_connection · search_api · read_api · write_api over api/operations.json
  │    └─ cresium/client.ts   signs HMAC-SHA256(secret, "timestamp|METHOD|url|body") and calls V3
  └─ docs/tools.ts            passes through to docs.cresium.com/mcp (Mintlify)
```

- The server stores no credentials: they live only for the request that carries them. It keeps in memory a one-way hash that says "these credentials worked"; the hash is gone on restart. A success is trusted for 10 minutes, so a docs tool logs one `GET /v3/balance/wallets` check per credential every 10 minutes instead of one per use.
- Logs are JSON lines (Pino). Each tool call logs the environment, company, the API key's last 4 characters, the tool, the V3 operation, its status and duration. The secret and the full key are never logged, and `src/http/app.test.ts` checks this.
- Each call to the API carries the `User-Agent` `cresium-mcp-server/<version>`.
- The logger censors the `x-api-key` and `x-api-secret` headers and any `apiKey` or `secret` field, in case new code ever logs them.
- `src/api/operations.json` is generated from `Cresium/bible`'s `openapi.json`. The API's deploy workflow in `mage` regenerates it and pushes it to `main` after each production deploy. Run `bun run spec:update` by hand to refresh it sooner.

### Search goldens

`test/search-goldens.ts` lists the phrases partners use, in Spanish and English, and the operation `search_api` must return for each in its top 3 (or nothing, for words the catalogue does not cover, like `webhook`). `test/search-goldens.test.ts` reports every phrase that fails and what search returned instead. Because the catalogue is regenerated after each production deploy, a failing golden after `bun run spec:update` means partners' words no longer find the right operation: add a synonym in `src/api/constants.ts` or fix the golden if the API really changed. There is no switch: it is a test.

### Tool metadata and registry listing

Every tool has a `title` and the behavior hints `readOnlyHint`, `destructiveHint` and `idempotentHint`, so clients can show a name and decide when to ask. Reads are read-only and idempotent; `write_api` is destructive and not idempotent; `send_docs_feedback` is neither. The server also names itself `Cresium` with its website. Hints are only hints: a client must not rely on them for safety.

`server.json` describes the two remotes for the [official MCP registry](https://github.com/modelcontextprotocol/registry). It is not published: publishing needs proof that Cresium owns the `app.cresium` namespace. `test/server-json.test.ts` keeps its URLs and header names in step with the code. There is no switch.

## Develop

```bash
cp .env.example .env
bun install
bun run dev          # http://localhost:3000/sandbox
bun run check        # format, lint, typecheck, unit tests
```

The end-to-end test against the real sandbox needs `CRESIUM_API_KEY`, `CRESIUM_SECRET` and `CRESIUM_COMPANY_ID` in `.env`:

```bash
bun run test:sandbox
```

## Deploy

The repo deploys with SleakOps (`.github/workflows/sleakops*.yml`, project `cresium-mcp`), and Doppler injects the environment from `.env.example`. Run the `SleakOps` workflow by hand from `staging` to deploy to develop, or from `main` to deploy to production. On a PR, comment `@claude` to get a Cresium-mode review.

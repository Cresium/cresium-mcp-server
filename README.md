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

### Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.cresium]
url = "https://mcp.cresium.app/sandbox"
http_headers = { "x-api-key" = "YOUR_API_KEY", "x-api-secret" = "YOUR_SECRET", "x-company-id" = "YOUR_COMPANY_ID" }
```

Claude.ai and ChatGPT on the web are not supported: they connect through OAuth and cannot send these headers.

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
- When an agent cancels a call, what reaches Cresium depends on the MCP protocol version. On the 2026 protocol the client closes the HTTP request, and the server aborts its call to the API right away (this needs Bun 1.4.4 or later; older Bun never reports the closed request). On the 2025 protocol the client sends the cancel as a separate POST, which a server without sessions cannot match to the running call, so that call runs until `TOOL_TIMEOUT_MS` (60 s by default). A cancelled write can still be applied in that window.
- The logger censors the `x-api-key` and `x-api-secret` headers and any `apiKey` or `secret` field, in case new code ever logs them.
- `src/api/operations.json` is generated from `Cresium/bible`'s `openapi.json`. The API's deploy workflow in `mage` regenerates it and pushes it to `main` after each production deploy. Run `bun run spec:update` by hand to refresh it sooner.

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

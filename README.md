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

| Tool                 | Does                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `search_api`         | Finds V3 operations by keyword and returns each one's id, parameters and body schema.               |
| `read_api`           | Runs a `GET` operation, for example `{ "operation": "GET /v3/balance/wallets" }`. Marked read-only. |
| `write_api`          | Runs any operation that is not a `GET`. Not read-only, so your agent asks before running it.        |
| `search_docs`        | Searches docs.cresium.com.                                                                          |
| `read_doc_page`      | Reads one docs page as Markdown.                                                                    |
| `send_docs_feedback` | Reports a wrong or missing docs page to the Cresium team.                                           |

`POST /v3/invoice/read` is not available because it uploads files from your disk. Call it through the API directly.

## How it works

```
agent ──POST /sandbox── headers: x-api-key · x-api-secret · x-company-id
  │
  ▼
cresium-mcp  (src/http/app.ts)
  ├─ partner/credentials.ts   reads the 3 headers; 401 if one is missing
  ├─ mcp/server.ts            one MCP server per request, bound to the environment
  ├─ api/tools.ts             search_api · read_api · write_api over api/operations.json
  │    └─ cresium/client.ts   signs HMAC-SHA256(secret, "timestamp|METHOD|url|body") and calls V3
  └─ docs/tools.ts            passes through to docs.cresium.com/mcp (Mintlify)
```

- The server stores nothing. Credentials live only for the request that carries them.
- Logs are JSON lines (Pino). Each tool call logs the environment, company, the API key's last 4 characters, the tool, the V3 operation, its status and duration. The secret and the full key are never logged, and `src/http/app.test.ts` checks this.
- `src/api/operations.json` is generated from `Cresium/bible`'s `openapi.json`. Run `bun run spec:update` after the API docs change.

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

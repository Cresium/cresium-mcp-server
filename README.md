<p align="center">
  <img src="https://d3gfub3l7gkyvv.cloudfront.net/landingImages/logo/cresium_primary.png" alt="Cresium" width="300" />
</p>

# Cresium MCP Server

MCP (Model Context Protocol) server the [Cresium](https://cresium.app) API. Enables AI tools like Claude Code and Claude Desktop to manage transactions, payments, invoices, and balances through the Cresium Partner API (V3).

## Prerequisites

You need a Cresium partner account with:

- **API Key** (`apiKey`)
- **Secret** (`secret`)
- **Company ID** (`companyId`)

These are available from the Cresium Dashboard under your partner settings.

## Installation

### Claude Code

```bash
claude mcp add cresium-server \
  -e CRESIUM_API_KEY=your_api_key \
  -e CRESIUM_SECRET=your_secret \
  -e CRESIUM_COMPANY_ID=your_company_id \
  -- node /absolute/path/to/cresium-mcp-server/build/index.js
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cresium": {
      "command": "node",
      "args": ["/absolute/path/to/cresium-mcp-server/build/index.js"],
      "env": {
        "CRESIUM_API_KEY": "your_api_key",
        "CRESIUM_SECRET": "your_secret",
        "CRESIUM_COMPANY_ID": "your_company_id"
      }
    }
  }
}
```

### Build from source

```bash
git clone <repo-url>
cd cresium-mcp-server
npm install
npm run build
```

## Environment Variables

| Variable             | Required | Description                       |
| -------------------- | -------- | --------------------------------- |
| `CRESIUM_API_KEY`    | Yes      | Partner API key                   |
| `CRESIUM_SECRET`     | Yes      | Partner secret for HMAC signing   |
| `CRESIUM_COMPANY_ID` | Yes      | Company ID to operate on          |

## Available Tools

| Tool                       | Description                                                |
| -------------------------- | ---------------------------------------------------------- |
| `health_check`             | Check API availability                                     |
| `get_balance`              | Get wallet balances (balance, locked, invested, available) |
| `search_transactions`      | Search transactions with filters and pagination            |
| `get_transaction`          | Get a single transaction by ID                             |
| `lookup_bank_address`      | Look up a CBU/CVU/alias to get the address ID              |
| `create_transfer_preview`  | Create a transfer preview (does not execute)               |
| `confirm_transaction`      | Confirm a previewed transaction                            |
| `create_signature_request` | Request signer approval for a transaction                  |
| `create_payments`          | Create payments (accounts payable)                         |
| `create_invoices`          | Create invoices (accounts receivable)                      |
| `list_payments`            | List all company payments                                  |
| `list_invoices`            | List all company invoices                                  |

## Typical Workflow

### Send a transfer

1. **Look up the destination**: `lookup_bank_address` with the CBU/CVU/alias
2. **Create a preview**: `create_transfer_preview` with the address ID, amount, and currency
3. **Request approval**: `create_signature_request` with the transaction ID (signers approve from Dashboard)

### Check balances and transactions

1. **Get balances**: `get_balance` to see available funds per currency
2. **Search transactions**: `search_transactions` with date or status filters
3. **Get details**: `get_transaction` with a specific transaction ID

## Authentication

All requests are signed using HMAC-SHA256. The server handles this transparently:

```
signature = HMAC-SHA256("{timestamp}|{METHOD}|{path}|{body}", secret) → base64
```

Headers sent on every request: `x-api-key`, `x-company-id`, `x-timestamp`, `x-signature`

## License

MIT

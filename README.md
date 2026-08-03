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

| Variable             | Required | Description                                                                     |
| -------------------- | -------- | ------------------------------------------------------------------------------- |
| `CRESIUM_API_KEY`    | Yes      | Partner API key                                                                 |
| `CRESIUM_SECRET`     | Yes      | Partner secret for HMAC signing                                                 |
| `CRESIUM_COMPANY_ID` | Yes      | Company ID to operate on                                                        |
| `CRESIUM_BASE_URL`   | No       | API URL. Defaults to `https://api.cresium.app`. Staging: `https://api.develop.cresium.app` |

## Available Tools

### Balances and investments

| Tool                            | Description                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `get_balance`                   | Wallet balances (balance, locked, invested, available) per currency             |
| `get_investment_fund_positions` | Investment fund positions with units held, current value and fund details       |

### Transactions

| Tool                      | Description                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| `search_transactions`     | Search with filters (date, type, operation type, direction, tag, status) |
| `get_transaction`         | Get a single transaction by ID                                           |
| `get_transaction_receipt` | Download the transaction receipt as a PDF                                |
| `lookup_bank_address`     | Look up a CBU/CVU/alias to get the address ID used as `toId`             |
| `create_transfer_preview` | Create a transfer in PREVIEW status (does not move money)                |
| `confirm_transaction`     | Confirm a previewed transaction                                          |
| `reverse_transaction`     | Refund a received deposit back to its sender                             |

### Collections — one-off payment orders (V2)

| Tool                    | Description                                                             |
| ----------------------- | ----------------------------------------------------------------------- |
| `create_payment_order`  | Create a one-off collection and get a dedicated CVU to receive it        |
| `search_payment_orders` | List payment orders with their status and amount collected               |
| `get_payment_order`     | Get one payment order by your own `externalId`                          |
| `delete_payment_order`  | Delete an unpaid order and take down its CVU                            |

### Collections — CVU management (V1, deprecated)

| Tool                           | Description                                       |
| ------------------------------ | ------------------------------------------------- |
| `list_deposit_addresses`       | List all active CVUs and aliases                  |
| `get_deposit_address`          | Get one CVU with its alias                        |
| `create_deposit_address`       | Issue a new CVU                                   |
| `update_deposit_address_alias` | Rename the alias of an active CVU                 |
| `delete_deposit_address`       | Take down a CVU (irreversible)                    |

### Signature requests

| Tool                        | Description                                                   |
| --------------------------- | ------------------------------------------------------------- |
| `search_signature_requests` | List signature requests and their status                      |
| `create_signature_request`  | Request signer approval for a transaction, bulk or payroll    |
| `reject_signature_request`  | Reject a pending request (approval is Dashboard-only)         |

### Accounts payable and receivable

| Tool                       | Description                                              |
| -------------------------- | -------------------------------------------------------- |
| `create_payments`          | Create payments (accounts payable)                       |
| `list_payments`            | List all company payments                                |
| `read_payments_from_files` | Extract payment data from PDFs/images via OCR            |
| `create_invoices`          | Create invoices (accounts receivable)                    |
| `list_invoices`            | List all company invoices                                |
| `read_invoices_from_files` | Extract invoice data from PDFs/images via OCR            |

### Other

| Tool           | Description              |
| -------------- | ------------------------ |
| `health_check` | Check API availability   |

## Typical Workflow

### Send a transfer

1. **Look up the destination**: `lookup_bank_address` with the CBU/CVU/alias
2. **Create a preview**: `create_transfer_preview` with the address ID, amount, and currency
3. **Request approval**: `create_signature_request` with the transaction ID (signers approve from Dashboard)

### Check balances and transactions

1. **Get balances**: `get_balance` to see available funds per currency
2. **Search transactions**: `search_transactions` with date or status filters
3. **Get details**: `get_transaction` with a specific transaction ID

### Collect a one-off payment

1. **Create the order**: `create_payment_order` with the expected amount and your own reference — returns a dedicated CVU
2. **Share the CVU** with the payer, and persist it to match incoming `DEPOSIT` webhooks
3. **Track it**: `get_payment_order` with your reference to see `status` and `amountPaid`

The CVU is taken down automatically once the order is paid or expires.

### Load invoices from files

1. **Extract**: `read_invoices_from_files` with local PDF/image paths — OCR only, nothing is saved
2. **Review** the extracted data
3. **Create**: `create_invoices` with the reviewed values

## Permissions

Some tools require a partner permission to be enabled on your account, otherwise the API
returns `403 FORBIDDEN`:

| Permission              | Tools                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `CREATE_CVU`            | `create_deposit_address`, `create_payment_order`, `delete_payment_order`                          |
| `UPDATE_CVU`            | `update_deposit_address_alias`                                                                    |
| `SEARCH_PAYMENT_ORDERS` | `search_payment_orders`, `get_payment_order`                                                      |

Contact the Cresium team to enable them.

## Authentication

All requests are signed using HMAC-SHA256. The server handles this transparently:

```
signature = HMAC-SHA256("{timestamp}|{METHOD}|{path+query}|{body}", secret) → base64
```

The signed path includes the query string exactly as sent. Headers sent on every request:
`x-api-key`, `x-company-id`, `x-timestamp`, `x-signature`. Requests are rejected if the
timestamp is more than 60 seconds old, so keep the host clock NTP-synced.

## License

MIT

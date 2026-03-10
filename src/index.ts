#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { type AxiosInstance } from "axios";
import crypto from "crypto";

const TOOL_DEFINITIONS = [
  {
    name: "health_check",
    description: "Check if the Cresium API is available and responding",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_balance",
    description:
      "Get wallet balances for the company. Returns balance, lockedBalance, investedBalance, availableBalance, and currency for each wallet.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "search_transactions",
    description:
      "Search and filter company transactions with pagination. Supports filtering by date range, type, tag, status, external ID, and more.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fromDate: {
          type: "string",
          description: "Start date filter (ISO 8601)",
        },
        toDate: {
          type: "string",
          description: "End date filter (ISO 8601)",
        },
        types: {
          type: "array",
          items: { type: "string" },
          description:
            "Transaction types to filter (DEPOSIT, WITHDRAWAL, YIELD, etc.)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Transaction tags to filter (SALARY, SUPPLIER, SERVICE, RENTAL)",
        },
        states: {
          type: "array",
          items: { type: "string" },
          description:
            "Transaction statuses to filter (SUCCESS, PENDING, PROCESSING, FAILED, PREVIEW)",
        },
        externalId: {
          type: "string",
          description: "Filter by external ID",
        },
        nameAmountFilter: {
          type: "string",
          description: "Filter by name or amount",
        },
        cursor: {
          type: "number",
          description: "Pagination cursor from previous response",
        },
        pageSize: {
          type: "number",
          description: "Number of results per page (default: 10)",
        },
        field: {
          type: "string",
          description: "Sort field",
        },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order",
        },
        depositAddressIds: {
          type: "array",
          items: { type: "number" },
          description: "Filter by deposit address IDs",
        },
        sendingFromDate: {
          type: "string",
          description: "Filter scheduled transactions from date (ISO 8601)",
        },
        sendingToDate: {
          type: "string",
          description: "Filter scheduled transactions to date (ISO 8601)",
        },
        scheduledTransactions: {
          type: "boolean",
          description: "Include only scheduled transactions",
        },
      },
    },
  },
  {
    name: "get_transaction",
    description:
      "Get a single transaction by ID. Returns the full transaction object including from/to addresses, amounts, fees, status, and related entities.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "number",
          description: "Transaction ID",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "lookup_bank_address",
    description:
      "Look up a bank address by CBU, CVU, or alias. Returns the address ID (needed as toId for creating transfers), bank name, owner name, and account type.",
    inputSchema: {
      type: "object" as const,
      properties: {
        value: {
          type: "string",
          description: "CBU, CVU, or alias to look up",
        },
      },
      required: ["value"],
    },
  },
  {
    name: "create_transfer_preview",
    description:
      "Create a transfer preview (does not execute the transfer yet). Use lookup_bank_address first to get the toId. Returns the preview transaction and whether 2FA is required.",
    inputSchema: {
      type: "object" as const,
      properties: {
        toId: {
          type: "number",
          description:
            "Destination address ID (from lookup_bank_address response)",
        },
        amount: {
          type: "string",
          description: "Transfer amount as string for decimal precision",
        },
        currencyCode: {
          type: "string",
          enum: ["ARS", "USD"],
          description: "Currency code",
        },
        tag: {
          type: "string",
          enum: ["SALARY", "SUPPLIER", "SERVICE", "RENTAL"],
          description: "Optional transaction tag",
        },
        sendingDate: {
          type: "string",
          description: "Optional scheduled date (ISO 8601)",
        },
        description: {
          type: "string",
          description: "Optional transfer description/concept",
        },
      },
      required: ["toId", "amount", "currencyCode"],
    },
  },
  {
    name: "confirm_transaction",
    description:
      "Confirm a previewed transaction, moving it from PREVIEW to PENDING status for processing. Only works on transactions in PREVIEW status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "number",
          description: "Transaction ID to confirm",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "create_signature_request",
    description:
      "Create a signature request for a transaction, bulk, or payroll. Signers will be notified and can approve from the Dashboard. The transaction auto-confirms on approval.",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: [
            "TRANSACTION_REQUEST",
            "BULK_REQUEST",
            "PAYROLL_REQUEST",
          ],
          description: "Type of signature request",
        },
        id: {
          type: "number",
          description:
            "ID of the entity to sign (transaction, bulk, or payroll)",
        },
      },
      required: ["type", "id"],
    },
  },
  {
    name: "create_payments",
    description:
      "Create one or more payments (accounts payable). Each payment represents an amount the company owes to a supplier/creditor.",
    inputSchema: {
      type: "object" as const,
      properties: {
        payments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              amount: { type: "number", description: "Payment amount" },
              userAddressId: {
                type: "number",
                description: "Supplier/creditor address ID",
              },
              status: {
                type: "string",
                enum: ["PENDING", "EXPIRED", "PAID", "CANCELED"],
              },
              description: { type: "string" },
              paymentMethod: {
                type: "string",
                enum: ["CASH", "TRANSFER", "ECHEQ", "OTHER"],
              },
              paymentDate: { type: "string" },
              fileUrl: { type: "string" },
              toId: { type: "number" },
              createdAt: { type: "string" },
              expiresAt: { type: "string" },
              externalId: { type: "string" },
              receiverEmail: { type: "string" },
            },
            required: ["amount", "userAddressId", "status"],
          },
          description: "Array of payment objects to create",
        },
      },
      required: ["payments"],
    },
  },
  {
    name: "create_invoices",
    description:
      "Create one or more invoices (accounts receivable). Each invoice represents an amount the company expects to receive from a customer.",
    inputSchema: {
      type: "object" as const,
      properties: {
        invoices: {
          type: "array",
          items: {
            type: "object",
            properties: {
              amount: { type: "number", description: "Invoice amount" },
              payerNationalIdentifier: {
                type: "string",
                description: "Payer CUIT/CUIL",
              },
              payerName: { type: "string", description: "Payer name" },
              status: {
                type: "string",
                enum: ["PENDING", "EXPIRED", "PAID"],
              },
              description: { type: "string" },
              internalNote: { type: "string" },
              payerInternalNote: { type: "string" },
              payerEmail: { type: "string" },
              expiresAt: { type: "string" },
              createdAt: { type: "string" },
              externalId: { type: "string" },
              fileUrl: { type: "string" },
            },
            required: [
              "amount",
              "payerNationalIdentifier",
              "payerName",
              "status",
            ],
          },
          description: "Array of invoice objects to create",
        },
      },
      required: ["invoices"],
    },
  },
  {
    name: "list_payments",
    description:
      "List all company payments. Returns the full list of payments with their status, amounts, and related data.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "list_invoices",
    description:
      "List all company invoices. Returns the full list of invoices with their status, amounts, payer information, and related data.",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

class CresiumServer {
  private server: Server;
  private apiKey: string;
  private secret: string;
  private companyId: string;
  private baseUrl: string;
  private client: AxiosInstance;

  constructor() {
    this.apiKey = process.env.CRESIUM_API_KEY ?? "";
    this.secret = process.env.CRESIUM_SECRET ?? "";
    this.companyId = process.env.CRESIUM_COMPANY_ID ?? "";
    this.baseUrl = "https://api.cresium.app";

    if (!this.apiKey || !this.secret || !this.companyId) {
      console.error(
        "Missing required env vars: CRESIUM_API_KEY, CRESIUM_SECRET, CRESIUM_COMPANY_ID"
      );
      process.exit(1);
    }

    this.client = axios.create({ baseURL: this.baseUrl });

    this.server = new Server(
      { name: "cresium-mcp-server", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async () => ({ tools: TOOL_DEFINITIONS })
    );

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => this.handleToolCall(request)
    );
  }

  private sign(
    method: string,
    path: string,
    body: string
  ): { timestamp: string; signature: string } {
    const timestamp = new Date().toISOString();
    const data = `${timestamp}|${method}|${path}|${body}`;
    const signature = crypto
      .createHmac("sha256", this.secret)
      .update(data)
      .digest("base64");
    return { timestamp, signature };
  }

  private async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    queryParams?: Record<string, unknown>,
    includeCompanyId = true
  ): Promise<unknown> {
    const bodyStr = body ? JSON.stringify(body) : "";
    const { timestamp, signature } = this.sign(method, path, bodyStr);

    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "x-timestamp": timestamp,
      "x-signature": signature,
      "Content-Type": "application/json",
    };

    if (includeCompanyId) {
      headers["x-company-id"] = this.companyId;
    }

    const response = await this.client.request({
      method,
      url: path,
      data: body,
      params: queryParams,
      headers,
    });

    return response.data;
  }

  private formatResponse(data: unknown): string {
    if (typeof data === "object" && data !== null) {
      return JSON.stringify(data, null, 2);
    }
    return String(data);
  }

  private async handleToolCall(request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }) {
    const { name, arguments: args = {} } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case "health_check":
          result = await this.request(
            "GET",
            "/v3/health/",
            undefined,
            undefined,
            false
          );
          break;

        case "get_balance":
          result = await this.request("GET", "/v3/balance/wallets");
          break;

        case "search_transactions": {
          const query: Record<string, unknown> = {};
          const fields = [
            "fromDate",
            "toDate",
            "externalId",
            "nameAmountFilter",
            "cursor",
            "pageSize",
            "field",
            "order",
            "sendingFromDate",
            "sendingToDate",
            "scheduledTransactions",
          ];
          for (const f of fields) {
            if (args[f] !== undefined) query[f] = args[f];
          }
          const arrayFields = [
            "types",
            "tags",
            "states",
            "depositAddressIds",
          ];
          for (const f of arrayFields) {
            if (Array.isArray(args[f])) {
              query[`${f}[]`] = args[f];
            }
          }
          result = await this.request(
            "GET",
            "/v3/transaction/search",
            undefined,
            query
          );
          break;
        }

        case "get_transaction":
          result = await this.request(
            "GET",
            `/v3/transaction/${args.id}`
          );
          break;

        case "lookup_bank_address":
          result = await this.request(
            "GET",
            `/v3/bank-address/${args.value}`,
            undefined,
            undefined,
            false
          );
          break;

        case "create_transfer_preview": {
          const body: Record<string, unknown> = {
            toId: args.toId,
            amount: args.amount,
            currencyCode: args.currencyCode,
          };
          if (args.tag) body.tag = args.tag;
          if (args.sendingDate) body.sendingDate = args.sendingDate;
          if (args.description) body.description = args.description;
          result = await this.request(
            "POST",
            "/v3/transaction/preview",
            body
          );
          break;
        }

        case "confirm_transaction":
          result = await this.request(
            "PUT",
            `/v3/transaction/confirm/${args.id}`
          );
          break;

        case "create_signature_request":
          result = await this.request(
            "POST",
            `/v3/signature-request/${args.type}`,
            { id: args.id }
          );
          break;

        case "create_payments":
          result = await this.request(
            "POST",
            "/v3/payment/",
            args.payments
          );
          break;

        case "create_invoices":
          result = await this.request(
            "POST",
            "/v3/invoice/",
            args.invoices
          );
          break;

        case "list_payments":
          result = await this.request("POST", "/v3/payment/", []);
          break;

        case "list_invoices":
          result = await this.request("POST", "/v3/invoice/", []);
          break;

        default:
          return {
            content: [
              { type: "text" as const, text: `Unknown tool: ${name}` },
            ],
            isError: true,
          };
      }

      return {
        content: [
          { type: "text" as const, text: this.formatResponse(result) },
        ],
      };
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && error.response
          ? `API error ${error.response.status}: ${JSON.stringify(error.response.data)}`
          : error instanceof Error
            ? error.message
            : String(error);

      return {
        content: [{ type: "text" as const, text: message }],
        isError: true,
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Cresium MCP server running on stdio");
  }
}

const server = new CresiumServer();
server.run().catch(console.error);

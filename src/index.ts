#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { type AxiosInstance } from "axios";
import crypto from "crypto";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const DEFAULT_BASE_URL = "https://api.cresium.app";

const TRANSACTION_TYPES = [
  "DEPOSIT",
  "WITHDRAWAL",
  "WITHDRAWAL_INVESTMENT",
  "DEPOSIT_INVESTMENT",
  "YIELD",
  "BILL_PAYMENT",
  "REFUND",
  "ECHEQ_WITHDRAWAL",
  "ECHEQ_DEPOSIT",
  "ECHEQ_REJECTED",
  "ECHEQ_CERTIFICATE",
  "COMISSION",
  "TAXES_DEBIT",
  "TAXES_REFUND",
  "INTEREST",
  "DEBIT_INVESTMENT",
  "CREDIT_INVESTMENT",
  "LOAN_PAYMENT",
  "LOAN_CREDIT",
  "COMEX_DEBIT",
  "COMEX_CREDIT",
];

const TRANSACTION_OPERATION_TYPES = [
  "MONEY_TRANSFER",
  "BULK_TRANSFER",
  "BILL_PAYMENT",
  "PAYROLL",
  "SMART_PAYMENT",
  "SMART_COLLECTION",
  "DEPOSIT",
  "YIELD",
];

const TRANSACTION_TAGS = [
  "RENTAL",
  "SUPPLIER",
  "SALARY",
  "INVESTMENT",
  "SERVICE",
  "BILL",
  "LOAN",
  "INSURANCE",
  "OTHER",
];

const TRANSACTION_STATUSES = [
  "PREVIEW",
  "PENDING",
  "PROCESSING",
  "SUCCESS",
  "FAILED",
  "CANCELED",
  "SCHEDULED",
];

const TRANSACTION_SORT_FIELDS = [
  "netAmount",
  "totalAmount",
  "processedAt",
  "receipt",
];

const CURRENCY_CODES = ["ARS", "USD"];

const INVOICE_STATUSES = ["DRAFT", "PENDING", "PARTIAL", "PAID", "CANCELED"];

const PAYMENT_STATUSES = [
  "PROCESSING",
  "EXPIRED",
  "PENDING",
  "PAID",
  "CANCELED",
];

const PAYMENT_METHODS = ["CASH", "TRANSFER", "ECHEQ", "OTHER"];

const SIGNATURE_REQUEST_TYPES = [
  "TRANSACTION_REQUEST",
  "BULK_REQUEST",
  "PAYROLL_REQUEST",
];

const SIGNATURE_REQUEST_STATUSES = ["PENDING", "SIGNED", "CANCELED"];

const REJECTION_REASONS = [
  "INVALID_DATA",
  "DUPLICATED",
  "NOT_AUTHORIZED",
  "INSUFFICIENT_FUNDS",
  "EXPIRED",
  "OTHER",
];

const DEPOSIT_ADDRESS_PRODUCT_TYPES = ["UNIQUE_PAYMENT", "DEDICATED_CVU"];

const UPLOAD_MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".csv": "text/csv",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const TOOL_DEFINITIONS = [
  {
    name: "health_check",
    description: "Check if the Cresium API is available and responding",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_balance",
    description:
      "Get the company's wallet balances: balance, lockedBalance and investedBalance. Compute available funds as balance - lockedBalance - investedBalance. Returns an array, which today holds only the shared ARS wallet.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_investment_fund_positions",
    description:
      "Get the company's investment fund positions. Each position holds shareAmount (units held), amount (current value = units x share value) and the full investmentFund object (type, horizon, profile, rescue term, APRs).",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "search_transactions",
    description:
      "Search and filter company transactions with cursor-based pagination. Filter by date range, type, operation type, direction, tag, status, external ID, deposit address and scheduled date.",
    inputSchema: {
      type: "object" as const,
      properties: {
        fromDate: {
          type: "string",
          description: "processedAt start date filter (ISO 8601)",
        },
        toDate: {
          type: "string",
          description: "processedAt end date filter (ISO 8601)",
        },
        types: {
          type: "array",
          items: { type: "string", enum: TRANSACTION_TYPES },
          description: "Transaction types to filter",
        },
        operationTypes: {
          type: "array",
          items: { type: "string", enum: TRANSACTION_OPERATION_TYPES },
          description:
            "Operation types to filter, combined with OR: MONEY_TRANSFER (single transfer), BULK_TRANSFER, BILL_PAYMENT (taxes/services), PAYROLL, SMART_PAYMENT, SMART_COLLECTION, DEPOSIT, YIELD",
        },
        direction: {
          type: "string",
          enum: ["INBOUND", "OUTBOUND"],
          description:
            "Filter by money direction: INBOUND (all money coming in) or OUTBOUND (all money going out). Covers every transaction type, not just DEPOSIT/WITHDRAWAL.",
        },
        tags: {
          type: "array",
          items: { type: "string", enum: TRANSACTION_TAGS },
          description: "Transaction tags to filter",
        },
        states: {
          type: "array",
          items: { type: "string", enum: TRANSACTION_STATUSES },
          description: "Transaction statuses to filter",
        },
        externalId: {
          type: "string",
          description: "Filter by external ID",
        },
        nameAmountFilter: {
          type: "string",
          description:
            "Free-text filter. A numeric value matches netAmount, otherwise matches company or contact name.",
        },
        depositAddressIds: {
          type: "array",
          items: { type: "number" },
          description:
            "Filter by one or more deposit address (CVU/account) numeric IDs, obtained from list_deposit_addresses",
        },
        sendingFromDate: {
          type: "string",
          description: "Scheduled sendingDate start filter (ISO 8601)",
        },
        sendingToDate: {
          type: "string",
          description: "Scheduled sendingDate end filter (ISO 8601)",
        },
        scheduledTransactions: {
          type: "boolean",
          description: "Include only scheduled transactions",
        },
        field: {
          type: "string",
          enum: TRANSACTION_SORT_FIELDS,
          description: "Sort field. Must be sent together with order.",
        },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order. Must be sent together with field.",
        },
        cursor: {
          type: "number",
          description:
            "Pagination cursor: the cursor value returned by the previous response",
        },
        pageSize: {
          type: "number",
          description: "Results per page (default 10, max 100)",
        },
      },
    },
  },
  {
    name: "get_transaction",
    description:
      "Get a single transaction by ID. Returns the full populated transaction including from/to addresses, totalAmount/netAmount, amounts breakdown, status and processedAt.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Transaction ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_transaction_receipt",
    description:
      "Get the PDF receipt of a transaction. The API returns it as a base64 string. Always pass outputPath to save it as a PDF file and get the path back — omitting it dumps the whole base64 payload into the conversation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Transaction ID" },
        outputPath: {
          type: "string",
          description:
            "Local file path to write the decoded PDF to (e.g. ./receipt-123.pdf). Strongly recommended.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "lookup_bank_address",
    description:
      "Look up an external bank account by CBU, CVU or alias. Returns the Address id (used as toId in create_transfer_preview), bank name, owner name and account type.",
    inputSchema: {
      type: "object" as const,
      properties: {
        value: { type: "string", description: "CBU, CVU or alias to look up" },
      },
      required: ["value"],
    },
  },
  {
    name: "create_transfer_preview",
    description:
      "Create a withdrawal transfer in PREVIEW status (does not move money yet). Use lookup_bank_address first to get toId. Only SAME NAME transfers are allowed: the destination account holder must match the company. Then either confirm_transaction or create_signature_request.",
    inputSchema: {
      type: "object" as const,
      properties: {
        toId: {
          type: "number",
          description:
            "Destination Address ID (the id field from lookup_bank_address)",
        },
        amount: {
          type: "string",
          description: "Transfer amount as a string for decimal precision",
        },
        currencyCode: {
          type: "string",
          enum: CURRENCY_CODES,
          description: "Currency code",
        },
        tag: {
          type: "string",
          enum: TRANSACTION_TAGS,
          description: "Optional transaction tag",
        },
        sendingDate: {
          type: "string",
          description:
            "Optional scheduled date (ISO 8601). Processed immediately when omitted.",
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
      "Confirm a transaction in PREVIEW status, moving it to PENDING for processing. Only same-name withdrawals can be confirmed through the partner API.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Transaction ID to confirm" },
      },
      required: ["id"],
    },
  },
  {
    name: "reverse_transaction",
    description:
      "Reverse (refund) a received deposit back to its sender. The original transaction must be a DEPOSIT in SUCCESS status and the amount cannot exceed the original. Creates and confirms a WITHDRAWAL to the origin account.",
    inputSchema: {
      type: "object" as const,
      properties: {
        transactionId: {
          type: "number",
          description: "ID of the DEPOSIT transaction to reverse",
        },
        amount: {
          type: "string",
          description:
            "Amount to return as a string. Returns the full amount when omitted.",
        },
      },
      required: ["transactionId"],
    },
  },
  {
    name: "list_deposit_addresses",
    description:
      "List all active CVUs and ALIASes of the company. A CVU and its ALIAS share the same externalId — group by that field to pair them. Use the returned id as depositAddressIds in search_transactions.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_deposit_address",
    description:
      "Get a single CVU of the company by its value, together with its ALIAS (both share the same externalId). Only resolves values that exist as a CVU for the company.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cvu: { type: "string", description: "CVU value to look up" },
      },
      required: ["cvu"],
    },
  },
  {
    name: "create_deposit_address",
    description:
      "Issue a new CVU for the company (deprecated V1 flow — prefer create_payment_order for one-off collections). Persist the returned value to match incoming DEPOSIT webhooks. Requires the CREATE_CVU partner permission. Companies are limited to 300 active CVUs by default.",
    inputSchema: {
      type: "object" as const,
      properties: {
        value: {
          type: "string",
          description:
            "Desired human-readable alias for the CVU (e.g. mi-empresa.pago-01)",
        },
        productType: {
          type: "string",
          enum: DEPOSIT_ADDRESS_PRODUCT_TYPES,
          description:
            "UNIQUE_PAYMENT (one-off collection, CVU is consumed/rotated on payment and does not count toward the 300 limit) or DEDICATED_CVU (fixed CVU for recurring deposits). Optional today but recommended — it becomes mandatory soon.",
        },
      },
      required: ["value"],
    },
  },
  {
    name: "update_deposit_address_alias",
    description:
      "Rename the alias of an existing active CVU of the company. Requires the UPDATE_CVU partner permission. Fails on CVUs that were already taken down.",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: {
          type: "string",
          description: "Current CVU to rename",
        },
        value: {
          type: "string",
          description: "New alias for the CVU (e.g. mi-empresa.cliente-01)",
        },
      },
      required: ["address", "value"],
    },
  },
  {
    name: "delete_deposit_address",
    description:
      "Take down an existing CVU of the company. Irreversible: the CVU is deleted at the bank and soft-deleted in Cresium — a new one must be issued to collect again.",
    inputSchema: {
      type: "object" as const,
      properties: {
        address: { type: "string", description: "CVU to take down" },
      },
      required: ["address"],
    },
  },
  {
    name: "create_payment_order",
    description:
      "Create a one-off payment order (pago único): Cresium issues a dedicated CVU for the expected amount and tracks amountPaid/status as deposits arrive, notifying them in the DEPOSIT webhook as paymentOrder. The CVU is taken down automatically when the order is PAID or expires. Requires the CREATE_CVU partner permission.",
    inputSchema: {
      type: "object" as const,
      properties: {
        alias: {
          type: "string",
          description:
            "Human-readable alias for the CVU to issue (e.g. mi-empresa.orden-01)",
        },
        externalId: {
          type: "string",
          description: "Your own reference for the collection. Unique per company.",
        },
        amount: {
          type: "number",
          description: "Expected amount to collect (greater than 0)",
        },
        title: { type: "string", description: "Optional order title" },
        description: {
          type: "string",
          description: "Optional order description",
        },
        metadata: {
          type: "object",
          additionalProperties: { type: "string" },
          description:
            "Optional key/value data echoed back in the webhook for reconciliation. Max 50 keys, keys up to 40 chars without brackets, string values up to 500 chars.",
        },
        expiresIn: {
          type: "string",
          description:
            "Duration the order stays open (e.g. 30m, 24h, 7d). Min 30 minutes, max 30 days, default 24h.",
        },
      },
      required: ["alias", "externalId", "amount"],
    },
  },
  {
    name: "search_payment_orders",
    description:
      "List one-off payment orders with cursor-based pagination, to check status and amountPaid. Requires the SEARCH_PAYMENT_ORDERS partner permission.",
    inputSchema: {
      type: "object" as const,
      properties: {
        externalId: {
          type: "string",
          description: "Filter by your own collection reference",
        },
        fromDate: {
          type: "string",
          description: "Creation date from (inclusive)",
        },
        toDate: { type: "string", description: "Creation date to (inclusive)" },
        cursor: {
          type: "number",
          description: "ID of the last order from the previous page",
        },
        pageSize: {
          type: "number",
          description: "Items per page (default 10, max 100)",
        },
      },
    },
  },
  {
    name: "get_payment_order",
    description:
      "Get a single one-off payment order by your externalId, including status, amountPaid and metadata. Requires the SEARCH_PAYMENT_ORDERS partner permission.",
    inputSchema: {
      type: "object" as const,
      properties: {
        externalId: {
          type: "string",
          description: "Your own collection reference",
        },
      },
      required: ["externalId"],
    },
  },
  {
    name: "delete_payment_order",
    description:
      "Delete a one-off payment order by your externalId and take down its CVU. Only allowed while the order is NOT_PAID or EXPIRED — orders with credited payments (PARTIAL/PAID) cannot be deleted. Requires the CREATE_CVU partner permission.",
    inputSchema: {
      type: "object" as const,
      properties: {
        externalId: {
          type: "string",
          description: "Your own collection reference",
        },
      },
      required: ["externalId"],
    },
  },
  {
    name: "search_signature_requests",
    description:
      "List the company's signature requests with cursor-based pagination. Each request includes its id, type, status, the populated transaction and rejection data when present.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: SIGNATURE_REQUEST_STATUSES,
          description: "Filter by status",
        },
        cursor: {
          type: "number",
          description: "ID of the last request from the previous page",
        },
        pageSize: { type: "number", description: "Results per page" },
      },
    },
  },
  {
    name: "create_signature_request",
    description:
      "Create a signature request for a transaction, bulk or payroll instead of confirming it directly. Signers are notified and approve from the Dashboard, which auto-confirms the transaction. The entity must be in PREVIEW status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: SIGNATURE_REQUEST_TYPES,
          description: "Type of signature request",
        },
        id: {
          type: "number",
          description:
            "ID of the entity to sign (transaction, bulk or payroll)",
        },
      },
      required: ["type", "id"],
    },
  },
  {
    name: "reject_signature_request",
    description:
      "Reject a pending signature request. Rejection is the only status change available through the API — approval happens exclusively from the Cresium Dashboard by a designated signer.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "number", description: "Signature request ID" },
        rejectionReason: {
          type: "string",
          enum: REJECTION_REASONS,
          description: "Optional rejection reason",
        },
        rejectionNote: {
          type: "string",
          description: "Optional free-text note about the rejection",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "create_payments",
    description:
      "Create one or more payments (accounts payable) — amounts the company owes to suppliers/creditors. Returns every payment of the company, including the new ones.",
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
                description: "Supplier/creditor user address ID",
              },
              status: { type: "string", enum: PAYMENT_STATUSES },
              description: { type: "string" },
              paymentMethod: { type: "string", enum: PAYMENT_METHODS },
              paymentDate: {
                type: "string",
                description: "Date the payment was made (ISO 8601)",
              },
              fileUrl: {
                type: "string",
                description: "URL of the attached receipt",
              },
              toId: {
                type: "number",
                description: "Destination Address ID",
              },
              createdAt: {
                type: "string",
                description: "Creation date (ISO 8601, default now)",
              },
              expiresAt: {
                type: "string",
                description: "Due date (ISO 8601)",
              },
              externalId: {
                type: "string",
                description: "Your own reference for reconciliation",
              },
              receiverEmail: {
                type: "string",
                description: "Supplier/creditor email",
              },
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
    name: "list_payments",
    description:
      "List all company payments (accounts payable). V3 has no GET list endpoint, so this posts an empty batch to the create endpoint, which creates nothing and returns the full list.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "read_payments_from_files",
    description:
      "Extract payment (accounts payable) data from invoice files via OCR without creating anything. Accepts up to 50 local files (PDF, PNG, JPG, JPEG, CSV, XLSX), max 5 MB each. Returns extractedPayments plus hasErrors/errors — feed the result into create_payments after review.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePaths: {
          type: "array",
          items: { type: "string" },
          description: "Local paths of the files to upload (max 50)",
        },
      },
      required: ["filePaths"],
    },
  },
  {
    name: "create_invoices",
    description:
      "Create one or more invoices (accounts receivable) — amounts the company expects to receive from customers. Returns every invoice of the company, including the new ones.",
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
              status: { type: "string", enum: INVOICE_STATUSES },
              description: { type: "string" },
              internalNote: {
                type: "string",
                description: "Internal note, not visible to the payer",
              },
              payerInternalNote: { type: "string" },
              payerEmail: { type: "string" },
              expiresAt: {
                type: "string",
                description: "Due date (ISO 8601)",
              },
              issuedAt: {
                type: "string",
                description: "Issue date (ISO 8601)",
              },
              externalId: {
                type: "string",
                description: "Your own reference for reconciliation",
              },
              fileKey: {
                type: "string",
                description:
                  "S3 key of a previously uploaded attachment/receipt",
              },
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
    name: "list_invoices",
    description:
      "List all company invoices (accounts receivable). V3 has no GET list endpoint, so this posts an empty batch to the create endpoint, which creates nothing and returns the full list.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "read_invoices_from_files",
    description:
      "Extract invoice (accounts receivable) data from files via OCR without creating anything. Accepts up to 50 local files (PDF, PNG, JPG, JPEG, CSV, XLSX), max 5 MB each. Returns extractedInvoices plus hasErrors/errors — feed the result into create_invoices after review.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filePaths: {
          type: "array",
          items: { type: "string" },
          description: "Local paths of the files to upload (max 50)",
        },
      },
      required: ["filePaths"],
    },
  },
];

interface CresiumRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  query?: Record<string, unknown>;
  formData?: FormData;
  includeCompanyId?: boolean;
}

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
    this.baseUrl = process.env.CRESIUM_BASE_URL ?? DEFAULT_BASE_URL;

    if (!this.apiKey || !this.secret || !this.companyId) {
      console.error(
        "Missing required env vars: CRESIUM_API_KEY, CRESIUM_SECRET, CRESIUM_COMPANY_ID"
      );
      process.exit(1);
    }

    this.client = axios.create({ baseURL: this.baseUrl });

    this.server = new Server(
      { name: "cresium-mcp-server", version: "2.0.0" },
      { capabilities: { tools: {} } }
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOL_DEFINITIONS,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) =>
      this.handleToolCall(request)
    );
  }

  private sign(
    method: string,
    url: string,
    body: string
  ): { timestamp: string; signature: string } {
    const timestamp = new Date().toISOString();
    const data = `${timestamp}|${method}|${url}|${body}`;
    const signature = crypto
      .createHmac("sha256", this.secret)
      .update(data)
      .digest("base64");
    return { timestamp, signature };
  }

  private buildQueryString(query?: Record<string, unknown>): string {
    if (!query) return "";

    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          params.append(`${key}[]`, String(item));
        }
        continue;
      }

      params.append(key, String(value));
    }

    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  }

  private async request({
    method,
    path: requestPath,
    body,
    query,
    formData,
    includeCompanyId = true,
  }: CresiumRequest): Promise<unknown> {
    const url = `${requestPath}${this.buildQueryString(query)}`;
    const bodyStr = body === undefined ? "" : JSON.stringify(body);
    const { timestamp, signature } = this.sign(method, url, bodyStr);

    const headers: Record<string, string | null> = {
      "x-api-key": this.apiKey,
      "x-timestamp": timestamp,
      "x-signature": signature,
    };

    if (includeCompanyId) {
      headers["x-company-id"] = this.companyId;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    // Requests with no JSON body must send no Content-Type at all. Axios would
    // otherwise default to application/x-www-form-urlencoded, which Fastify's
    // formbody parser turns into an empty object, making the API sign "{}"
    // against our "" and reject the signature. Multipart is left untouched so
    // axios can set its own boundary.
    if (body === undefined && !formData) {
      headers["Content-Type"] = null;
    }

    const response = await this.client.request({
      method,
      url,
      data: formData ?? body,
      headers,
    });

    return response.data;
  }

  private async buildFileUpload(filePaths: unknown): Promise<FormData> {
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      throw new Error("filePaths must be a non-empty array of local paths");
    }

    if (filePaths.length > 50) {
      throw new Error("A maximum of 50 files can be uploaded per request");
    }

    const formData = new FormData();

    for (const filePath of filePaths) {
      const resolvedPath = String(filePath);
      const content = await readFile(resolvedPath);
      const extension = path.extname(resolvedPath).toLowerCase();
      const type = UPLOAD_MIME_TYPES[extension];

      if (!type) {
        throw new Error(
          `Unsupported file type "${extension}" for ${resolvedPath}. Allowed: ${Object.keys(UPLOAD_MIME_TYPES).join(", ")}`
        );
      }

      formData.append(
        "file",
        new Blob([new Uint8Array(content)], { type }),
        path.basename(resolvedPath)
      );
    }

    return formData;
  }

  private pick(
    args: Record<string, unknown>,
    keys: string[]
  ): Record<string, unknown> {
    const picked: Record<string, unknown> = {};

    for (const key of keys) {
      if (args[key] !== undefined) picked[key] = args[key];
    }

    return picked;
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
          result = await this.request({
            method: "GET",
            path: "/v3/health/",
            includeCompanyId: false,
          });
          break;

        case "get_balance":
          result = await this.request({
            method: "GET",
            path: "/v3/balance/wallets",
          });
          break;

        case "get_investment_fund_positions":
          result = await this.request({
            method: "GET",
            path: "/v3/investment-fund/positions",
          });
          break;

        case "search_transactions":
          result = await this.request({
            method: "GET",
            path: "/v3/transaction/search",
            query: this.pick(args, [
              "fromDate",
              "toDate",
              "types",
              "operationTypes",
              "direction",
              "tags",
              "states",
              "externalId",
              "nameAmountFilter",
              "depositAddressIds",
              "sendingFromDate",
              "sendingToDate",
              "scheduledTransactions",
              "field",
              "order",
              "cursor",
              "pageSize",
            ]),
          });
          break;

        case "get_transaction":
          result = await this.request({
            method: "GET",
            path: `/v3/transaction/${args.id}`,
          });
          break;

        case "get_transaction_receipt": {
          const receipt = await this.request({
            method: "GET",
            path: `/v3/transaction/receipt/${args.id}`,
          });

          if (!args.outputPath) {
            result = receipt;
            break;
          }

          const base64 = (receipt as { data?: string }).data ?? "";
          const pdf = Buffer.from(base64, "base64");
          const outputPath = path.resolve(String(args.outputPath));

          await writeFile(outputPath, pdf);

          result = { path: outputPath, bytes: pdf.byteLength };
          break;
        }

        case "lookup_bank_address":
          result = await this.request({
            method: "GET",
            path: `/v3/bank-address/${encodeURIComponent(String(args.value))}`,
            includeCompanyId: false,
          });
          break;

        case "create_transfer_preview":
          result = await this.request({
            method: "POST",
            path: "/v3/transaction/preview",
            body: this.pick(args, [
              "toId",
              "amount",
              "currencyCode",
              "tag",
              "sendingDate",
              "description",
            ]),
          });
          break;

        case "confirm_transaction":
          result = await this.request({
            method: "PUT",
            path: `/v3/transaction/confirm/${args.id}`,
          });
          break;

        case "reverse_transaction":
          result = await this.request({
            method: "POST",
            path: "/v3/transaction/reverse",
            body: this.pick(args, ["transactionId", "amount"]),
          });
          break;

        case "list_deposit_addresses":
          result = await this.request({
            method: "GET",
            path: "/v3/deposit-address/",
          });
          break;

        case "get_deposit_address":
          result = await this.request({
            method: "GET",
            path: `/v3/deposit-address/${encodeURIComponent(String(args.cvu))}`,
          });
          break;

        case "create_deposit_address":
          result = await this.request({
            method: "POST",
            path: "/v3/deposit-address/cvu",
            body: this.pick(args, ["value", "productType"]),
          });
          break;

        case "update_deposit_address_alias":
          result = await this.request({
            method: "PUT",
            path: `/v3/deposit-address/${encodeURIComponent(String(args.address))}`,
            body: { value: args.value },
          });
          break;

        case "delete_deposit_address":
          result = await this.request({
            method: "DELETE",
            path: `/v3/deposit-address/${encodeURIComponent(String(args.address))}`,
          });
          break;

        case "create_payment_order":
          result = await this.request({
            method: "POST",
            path: "/v3/payment-order/",
            body: {
              alias: args.alias,
              paymentOrder: this.pick(args, [
                "externalId",
                "amount",
                "title",
                "description",
                "metadata",
                "expiresIn",
              ]),
            },
          });
          break;

        case "search_payment_orders":
          result = await this.request({
            method: "GET",
            path: "/v3/payment-order/",
            query: this.pick(args, [
              "externalId",
              "fromDate",
              "toDate",
              "cursor",
              "pageSize",
            ]),
          });
          break;

        case "get_payment_order":
          result = await this.request({
            method: "GET",
            path: `/v3/payment-order/${encodeURIComponent(String(args.externalId))}`,
          });
          break;

        case "delete_payment_order":
          result = await this.request({
            method: "DELETE",
            path: `/v3/payment-order/${encodeURIComponent(String(args.externalId))}`,
          });
          break;

        case "search_signature_requests":
          result = await this.request({
            method: "GET",
            path: "/v3/signature-request/",
            query: this.pick(args, ["status", "cursor", "pageSize"]),
          });
          break;

        case "create_signature_request":
          result = await this.request({
            method: "POST",
            path: `/v3/signature-request/${args.type}`,
            body: { id: args.id },
          });
          break;

        case "reject_signature_request":
          result = await this.request({
            method: "PUT",
            path: `/v3/signature-request/${args.id}`,
            body: {
              status: "CANCELED",
              ...this.pick(args, ["rejectionReason", "rejectionNote"]),
            },
          });
          break;

        case "create_payments":
          result = await this.request({
            method: "POST",
            path: "/v3/payment/",
            body: args.payments,
          });
          break;

        case "list_payments":
          result = await this.request({
            method: "POST",
            path: "/v3/payment/",
            body: [],
          });
          break;

        case "read_payments_from_files":
          result = await this.request({
            method: "POST",
            path: "/v3/payment/read",
            formData: await this.buildFileUpload(args.filePaths),
          });
          break;

        case "create_invoices":
          result = await this.request({
            method: "POST",
            path: "/v3/invoice/",
            body: args.invoices,
          });
          break;

        case "list_invoices":
          result = await this.request({
            method: "POST",
            path: "/v3/invoice/",
            body: [],
          });
          break;

        case "read_invoices_from_files":
          result = await this.request({
            method: "POST",
            path: "/v3/invoice/read",
            formData: await this.buildFileUpload(args.filePaths),
          });
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

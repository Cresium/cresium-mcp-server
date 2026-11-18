import type { SearchGolden } from "./support/types.ts";

const CVU = "POST /v3/deposit-address/cvu";
const LIST_CVUS = "GET /v3/deposit-address/";
const FIND_CVU = "GET /v3/deposit-address/{cvu}";
const RENAME_CVU = "PUT /v3/deposit-address/{address}";
const CLOSE_CVU = "DELETE /v3/deposit-address/{address}";
const REACTIVATE_CVU = "POST /v3/deposit-address/{address}/reactivate";
const FIND_PAYMENTS = "GET /v3/payment-order/";
const CREATE_PAYMENT = "POST /v3/payment-order/";
const FIND_PAYMENT = "GET /v3/payment-order/{externalId}";
const DELETE_PAYMENT = "DELETE /v3/payment-order/{externalId}";
const BALANCES = "GET /v3/balance/";
const MAIN_BALANCE = "GET /v3/balance/wallets";
const FUND_POSITIONS = "GET /v3/investment-fund/positions";
const TRANSACTION = "GET /v3/transaction/{id}";
const SEARCH_TRANSACTIONS = "GET /v3/transaction/search";
const PREVIEW = "POST /v3/transaction/preview";
const CONFIRM = "PUT /v3/transaction/confirm/{id}";
const REVERSE = "POST /v3/transaction/reverse";
const RECEIPT = "GET /v3/transaction/receipt/{id}";
const BANK_ACCOUNT = "GET /v3/bank-address/{value}";
const LIST_SIGNATURES = "GET /v3/signature-request/";
const CREATE_SIGNATURE = "POST /v3/signature-request/{type}";
const REJECT_SIGNATURE = "PUT /v3/signature-request/{id}";
const INVOICES = "POST /v3/invoice/";
const CLIENT_MARKUP = "PUT /v3/company-tax/";
const DEFAULT_MARKUP = "GET /v3/company-tax/default";
const SET_DEFAULT_MARKUP = "PUT /v3/company-tax/default";
const FEE = "GET /v3/company-tax/{key}";
const SIMULATE_DEPOSIT = "POST /v3/sandbox/deposit";

/** Phrases partners use, and what search_api must answer. Keep each tag of the catalogue covered at least twice. */
export const SEARCH_GOLDENS: readonly SearchGolden[] = [
  // Emisión y gestión de CVUs Dedicados
  { phrase: "crear cvu", top3: CVU },
  { phrase: "emitir un cvu para un cliente", top3: CVU },
  { phrase: "issue a dedicated CVU", top3: CVU },
  { phrase: "listar mis cvus", top3: LIST_CVUS },
  { phrase: "buscar un cvu", top3: FIND_CVU },
  { phrase: "cambiar el alias del cvu", top3: RENAME_CVU },
  { phrase: "change the alias of a CVU", top3: RENAME_CVU },
  { phrase: "dar de baja un cvu", top3: CLOSE_CVU },
  { phrase: "deactivate a cvu", top3: CLOSE_CVU },
  { phrase: "reactivar un cvu", top3: REACTIVATE_CVU },

  // Emisión y gestión de Pagos Únicos
  { phrase: "crear un pago único", top3: CREATE_PAYMENT },
  { phrase: "create a payment order", top3: CREATE_PAYMENT },
  { phrase: "buscar pagos únicos", top3: FIND_PAYMENTS },
  { phrase: "buscar un pago por externalId", top3: FIND_PAYMENT },
  { phrase: "borrar un pago único", top3: DELETE_PAYMENT },
  { phrase: "cancel a payment order", top3: DELETE_PAYMENT },

  // Saldos
  { phrase: "saldo", top3: BALANCES },
  { phrase: "consultar el saldo de mis cuentas", top3: BALANCES },
  { phrase: "check my balance", top3: BALANCES },
  { phrase: "saldo del cvu principal", top3: MAIN_BALANCE },

  // Fondos de Inversión
  { phrase: "fondos de inversión", top3: FUND_POSITIONS },
  { phrase: "investment fund positions", top3: FUND_POSITIONS },

  // Transacciones
  { phrase: "devolver un depósito", top3: REVERSE },
  { phrase: "refund a deposit", top3: REVERSE },
  { phrase: "ver una transacción por id", top3: TRANSACTION },
  { phrase: "buscar transacciones", top3: SEARCH_TRANSACTIONS },
  { phrase: "list transactions", top3: SEARCH_TRANSACTIONS },
  { phrase: "transferir a otra cuenta", top3: PREVIEW },
  { phrase: "send a transfer", top3: PREVIEW },
  { phrase: "confirmar una transferencia", top3: CONFIRM },
  { phrase: "descargar el comprobante", top3: RECEIPT },
  { phrase: "download a receipt", top3: RECEIPT },

  // Búsqueda de Cuentas Bancarias
  { phrase: "consultar un cbu", top3: BANK_ACCOUNT },
  { phrase: "buscar una cuenta por alias", top3: BANK_ACCOUNT },
  { phrase: "lookup a bank account", top3: BANK_ACCOUNT },

  // Solicitudes de Firma
  { phrase: "solicitudes de firma pendientes", top3: LIST_SIGNATURES },
  { phrase: "rechazar una solicitud de firma", top3: REJECT_SIGNATURE },
  { phrase: "create a signature request", top3: CREATE_SIGNATURE },

  // Cuentas por Cobrar
  { phrase: "crear una factura", top3: INVOICES },
  { phrase: "cuentas por cobrar", top3: INVOICES },
  { phrase: "create invoices", top3: INVOICES },

  // Comisiones de tus clientes
  { phrase: "comisiones", top3: FEE },
  { phrase: "definir el markup de un cliente", top3: CLIENT_MARKUP },
  { phrase: "markup base para clientes nuevos", top3: DEFAULT_MARKUP },
  { phrase: "cambiar el markup base", top3: SET_DEFAULT_MARKUP },
  { phrase: "what fee does Cresium charge", top3: FEE },

  // Sandbox
  { phrase: "simular un depósito", top3: SIMULATE_DEPOSIT },
  { phrase: "simulate a deposit in sandbox", top3: SIMULATE_DEPOSIT },

  // Over-matching guards: nothing in the catalogue answers these
  { phrase: "webhook", none: true },
  { phrase: "tarjeta de crédito", none: true },
  { phrase: "weather forecast", none: true },
  { phrase: "bitcoin", none: true },
  { phrase: "pizza", none: true },

  // Over-matching guards: a shared word must not pull in the wrong operation
  { phrase: "devolver un depósito", notFirst: SIMULATE_DEPOSIT },
  { phrase: "simular un depósito", notFirst: REVERSE },
  { phrase: "borrar un pago único", notFirst: CLOSE_CVU },
  { phrase: "dar de baja un cvu", notFirst: DELETE_PAYMENT },
  { phrase: "saldo", notFirst: SIMULATE_DEPOSIT },
  { phrase: "refund a deposit", notFirst: SIMULATE_DEPOSIT },
];

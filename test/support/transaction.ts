/** A deposit as GET /v3/transaction/search lists it. */
export function sampleTransaction(index: number): Record<string, unknown> {
  return {
    id: 1000 + index,
    externalId: `ext-${index}`,
    type: "DEPOSIT",
    status: "COMPLETED",
    amount: "1500.00",
    currencyCode: "ARS",
    fromId: 7,
    toId: 42,
    description: "Cobro cliente",
    createdAt: "2026-11-17T12:00:00.000Z",
    processedAt: "2026-11-17T12:00:05.000Z",
    counterparty: {
      name: "Juan Perez",
      nationalIdentifier: "20123456786",
      cvu: "0000003100000000000001",
      bank: "Banco Ejemplo",
    },
    fee: { amount: "15.00", currencyCode: "ARS" },
    metadata: { orderId: `order-${index}`, note: "pago de prueba" },
  };
}

/** A page of `size` transactions with its pagination fields, as the API answers. */
export function transactionPage(size: number): string {
  return JSON.stringify({
    data: {
      items: Array.from({ length: size }, (_, index) =>
        sampleTransaction(index),
      ),
      cursor: "abc",
      pageSize: size,
      total: 120,
    },
  });
}

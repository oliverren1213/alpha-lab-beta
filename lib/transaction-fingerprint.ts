import type { TransactionType } from "./types";

type TradeIdentity = {
  accountId: string;
  assetId: string | null;
  type: TransactionType;
  tradedAt: string;
  quantity: number;
  unitPrice: number | null;
};

const pricedTradeTypes = new Set<TransactionType>([
  "BUY",
  "SELL",
  "SUBSCRIPTION",
  "REDEMPTION",
]);

export function transactionFingerprint(transaction: TradeIdentity) {
  const tradeDate = /^\d{4}-\d{2}-\d{2}/.exec(transaction.tradedAt)?.[0];
  if (
    !tradeDate
    || !transaction.assetId
    || !pricedTradeTypes.has(transaction.type)
    || transaction.unitPrice == null
  ) return null;

  return [
    transaction.accountId,
    transaction.assetId,
    transaction.type,
    tradeDate,
    Number(transaction.quantity),
    Number(transaction.unitPrice),
  ].join("|");
}

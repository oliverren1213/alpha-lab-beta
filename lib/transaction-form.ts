import type { TransactionType } from "./types";

type AmountPreviewInput = {
  type: TransactionType;
  quantity: number | null;
  unitPrice: number | null;
  totalAmount: number | null;
  fee: number;
  tax: number;
};

export function normalizeTradeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("请选择有效的成交日期");
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) throw new Error("请选择有效的成交日期");
  return value;
}

export function transactionAmountPreview(input: AmountPreviewInput) {
  const gross = input.quantity != null && input.unitPrice != null
    ? input.quantity * input.unitPrice
    : null;
  const costs = input.fee + input.tax;

  if (input.type === "BUY" || input.type === "SUBSCRIPTION") {
    return gross == null ? null : { gross, cashChange: -(gross + costs) };
  }
  if (input.type === "SELL" || input.type === "REDEMPTION") {
    return gross == null ? null : { gross, cashChange: gross - costs };
  }
  if (input.type === "CASH_IN" || input.type === "DIVIDEND") {
    return input.totalAmount == null
      ? null
      : { gross: input.totalAmount, cashChange: input.totalAmount - costs };
  }
  if (input.type === "CASH_OUT") {
    return input.totalAmount == null
      ? null
      : { gross: input.totalAmount, cashChange: -(input.totalAmount + costs) };
  }
  if (input.type === "FEE" || input.type === "DIVIDEND_TAX") {
    return input.totalAmount == null
      ? null
      : { gross: input.totalAmount, cashChange: -input.totalAmount };
  }
  return null;
}

import type { Account, Asset, Currency, LedgerTransaction, TransactionType } from "./types";
import { parseOcrTrades, type ResolvedScreenshotTrade } from "./screenshot-import";
import { feeStatus, type FeeStatus } from "./fee-status";

export type InboxTrade = {
  accountId: string; assetId: string | null; type: TransactionType; tradedAt: string;
  settlementDate: string | null; quantity: number; unitPrice: number | null;
  currency: Currency; fee: number | null; tax: number | null; fxToBase: number | null;
  totalAmount: number | null; reference: string; evidence: string; source: string;
  feeStatus?: FeeStatus;
};
export type InboxDocument = { id: string; filename: string; createdAt: string; status: "DRAFT" | "APPLIED" | "UNDONE"; rawText: string; trades: InboxTrade[] };
export type InboxMatch = { status: "NEW" | "EXISTS" | "UPDATE" | "CONFLICT" | "INCOMPLETE"; existingId?: string; differences: string[] };
export const inboxStatuses = { NEW: "新交易", EXISTS: "已存在", UPDATE: "补充信息", CONFLICT: "存在差异", INCOMPLETE: "待补全" };

export function fromScreenshot(trade: ResolvedScreenshotTrade, rawText: string, assets: Asset[] = []): InboxTrade {
  const currency = trade.currency ?? assets.find((asset) => asset.id === trade.assetId)?.currency ?? "USD";
  const priced = ["BUY", "SELL", "SUBSCRIPTION", "REDEMPTION"].includes(trade.type);
  return { accountId: trade.accountId ?? "", assetId: trade.assetId, type: trade.type, tradedAt: trade.tradedAt ?? "", settlementDate: null, quantity: trade.quantity ?? 0, unitPrice: trade.unitPrice, currency, fee: trade.fee ?? (priced ? 0 : null), tax: trade.tax ?? (priced ? 0 : null), feeStatus: priced ? "PROVISIONAL" : undefined, fxToBase: currency === "USD" ? 1 : null, totalAmount: trade.totalAmount, reference: trade.reference ?? "", evidence: rawText.slice(0, 6000), source: trade.sourceText };
}

export function matchInboxTrade(trade: InboxTrade, ledger: LedgerTransaction[]): InboxMatch {
  const priced = ["BUY", "SELL", "SUBSCRIPTION", "REDEMPTION"].includes(trade.type);
  if (!trade.accountId || !trade.assetId || !/^\d{4}-\d{2}-\d{2}$/.test(trade.tradedAt) || (priced && (!(trade.quantity > 0) || !(Number(trade.unitPrice) > 0))) || (!priced && trade.totalAmount == null) || trade.fee == null || trade.tax == null || (trade.currency !== "USD" && !(Number(trade.fxToBase) > 0))) return { status: "INCOMPLETE", differences: [] };
  const candidates = ledger.filter((row) => row.accountId === trade.accountId && row.assetId === trade.assetId && row.type === trade.type && row.currency === trade.currency && row.tradedAt.slice(0,10) === trade.tradedAt);
  const referenced = trade.reference ? candidates.filter((row) => row.note?.includes(trade.reference)) : [];
  const exact = candidates.filter((row) => priced ? row.quantity === trade.quantity && row.unitPrice === trade.unitPrice : row.totalAmount === trade.totalAmount);
  const found = referenced.length === 1 ? referenced[0] : exact.length === 1 ? exact[0] : candidates.length === 1 ? candidates[0] : null;
  if (!found) return { status: candidates.length ? "CONFLICT" : "NEW", differences: candidates.length ? ["同日有多笔记录，请在账本中逐笔核对"] : [] };
  const fields: Array<[keyof InboxTrade, string]> = [["quantity","数量"],["unitPrice","成交价"],["fee","费用"],["tax","税费"],["fxToBase","交易汇率"]];
  const preserveFinalFees = trade.feeStatus === "PROVISIONAL" && feeStatus(found) !== "PROVISIONAL";
  const differences = fields.filter(([key]) => !(preserveFinalFees && ["fee","tax"].includes(key)) && trade[key] != null && trade[key] !== found[key as keyof LedgerTransaction]).map(([,label]) => label);
  if (trade.totalAmount != null && found.totalAmount != null && trade.totalAmount !== found.totalAmount) differences.push("金额");
  if (trade.settlementDate && found.settlementDate && trade.settlementDate !== found.settlementDate) differences.push("交收日期");
  if (differences.length) return { status: "CONFLICT", existingId: found.id, differences };
  const enrichment = (trade.settlementDate && !found.settlementDate) || (trade.reference && !found.note?.includes(trade.reference)) || !found.reconciled || (trade.feeStatus === "STATEMENT" && feeStatus(found) !== "STATEMENT");
  return { status: enrichment ? "UPDATE" : "EXISTS", existingId: found.id, differences: enrichment ? ["交收日期 / 来源 / 核对状态"] : [] };
}

const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
function bankDate(value: string) { const match = /^(\d{2})([A-Z]{3})(\d{4})$/.exec(value); return match ? `${match[3]}-${String(months.indexOf(match[2])+1).padStart(2,"0")}-${match[1]}` : ""; }
const amount = (value: string) => Number(value.replace(/,/g,""));

export function parseStatementText(rawText: string, accounts: Account[], assets: Asset[]) {
  const text = rawText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  if (!/Transaction summary/i.test(text) || !/HSBC/i.test(text)) {
    const parsed = parseOcrTrades(text, accounts, assets);
    return parsed.trades.map((trade) => fromScreenshot(trade, text, assets));
  }
  const result: InboxTrade[] = [];
  const account = accounts.filter((item) => /HSBC|汇丰/i.test(item.name + item.institution));
  const zeroCharges = /Total charges and income\s+USD\s+0\.00/i.test(text);
  // Parse only explicit transaction sections. Portfolio balances are never buys.
  for (const section of text.split(/Transaction summary/i).slice(1)) {
    const transactionText = section.split(/Charges and income summary|Thank you for choosing HSBC|Notes\s*\n/i)[0];
    const regex = /\b([A-Z][A-Z0-9.-]{0,9})\s+([^\n]+)\n\s*(\d{2}[A-Z]{3}\d{4})\s+(\d{2}[A-Z]{3}\d{4})\s+(USD|HKD|CNY|EUR)\s+([\d,.]+)\s+([\d,.]+)\s+\5\s+([\d,.]+)\s*\n\s*Reference:\s*([A-Z0-9]+)\s+Type:\s*(PUR|SAL)\b/g;
    for (const m of transactionText.matchAll(regex)) {
      const symbol = m[1]; const unitPrice = amount(m[6]); const quantity = amount(m[7]); const settlement = amount(m[8]);
      const exactSettlement = Math.abs(unitPrice * quantity - settlement) < .011;
      result.push({ accountId: account.length === 1 ? account[0].id : "", assetId: assets.find((asset) => asset.symbol === symbol && asset.currency === m[5])?.id ?? null, type: m[10] === "PUR" ? "BUY" : "SELL", tradedAt: bankDate(m[3]), settlementDate: bankDate(m[4]), quantity, unitPrice, currency: m[5] as Currency, fee: exactSettlement && zeroCharges ? 0 : null, tax: exactSettlement && zeroCharges ? 0 : null, feeStatus: "STATEMENT", fxToBase: m[5] === "USD" ? 1 : null, totalAmount: settlement, reference: m[9], evidence: m[0], source: "HSBC investment statement" });
    }
  }
  for (const m of text.matchAll(/(\d{2}[A-Z]{3}\d{4})\s+CASH DIVIDEND\s+([A-Z][A-Z0-9.-]{0,9})[\s\S]{0,180}?OUR REFERENCE:\s*([A-Z0-9]+)\s*PAID BENEFITS\s+(USD|HKD|CNY|EUR)\s+([\d,.]+)/g)) {
    result.push({ accountId: account.length === 1 ? account[0].id : "", assetId: assets.find((asset) => asset.symbol === m[2] && asset.currency === m[4])?.id ?? null, type: "DIVIDEND", tradedAt: bankDate(m[1]), settlementDate: bankDate(m[1]), quantity: 0, unitPrice: null, currency: m[4] as Currency, fee: zeroCharges ? 0 : null, tax: null, feeStatus: "STATEMENT", fxToBase: m[4] === "USD" ? 1 : null, totalAmount: amount(m[5]), reference: m[3], evidence: m[0] + "\nPaid benefits may be net of withholding. Confirm gross income and tax before saving.", source: "HSBC investment statement" });
  }
  return result;
}

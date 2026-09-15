import type { Account, Asset, Currency, TransactionType } from "./types";

const transactionTypes = new Set<TransactionType>([
  "BUY", "SELL", "DIVIDEND", "DIVIDEND_TAX", "FEE", "SUBSCRIPTION",
  "REDEMPTION", "SPLIT", "CASH_IN", "CASH_OUT",
]);
const currencies = new Set<Currency>(["USD", "HKD", "CNY", "EUR"]);

export type ScreenshotTrade = {
  type: TransactionType;
  tradedAt: string | null;
  quantity: number | null;
  unitPrice: number | null;
  currency: Currency | null;
  fee: number | null;
  tax: number | null;
  totalAmount: number | null;
  symbol: string | null;
  assetName: string | null;
  accountHint: string | null;
  sourceText: string;
  reference: string | null;
  confidence: number;
  warnings: string[];
};

export type ResolvedScreenshotTrade = ScreenshotTrade & {
  accountId: string | null;
  assetId: string | null;
};

export async function recognizeScreenshotLocally(
  image: File,
  accounts: Account[],
  assets: Asset[],
  onProgress?: (progress: number) => void,
) {
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(image.type)) {
    throw new Error("仅支持 JPEG、PNG 或 WebP 图片");
  }
  if (!image.size || image.size > 8 * 1024 * 1024) throw new Error("图片需小于 8 MB");

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["eng", "chi_sim"], undefined, {
    logger: ({ progress }) => onProgress?.(progress),
  });
  try {
    const result = await worker.recognize(image, { rotateAuto: true });
    return parseOcrTrades(result.data.text, accounts, assets);
  } finally {
    await worker.terminate();
  }
}

export function parseOcrTrades(text: string, accounts: Account[], assets: Asset[]) {
  const normalized = normalizeOcrText(text);
  if (!normalized.trim()) throw new Error("截图中没有可读取的文字");
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const anchors = findTradeAnchors(lines, assets);
  const candidates = anchors.length
    ? anchors.map((anchor) => parseTradeWindow(lines, anchor.line, anchor.asset, accounts))
    : [parseTradeWindow(lines, Math.floor(lines.length / 2), null, accounts)];
  const trades = uniqueTrades(candidates.filter((trade): trade is ScreenshotTrade => Boolean(trade))).slice(0, 12);
  const documentWarnings = [
    "本地 OCR 可能误读数字，请对照原图逐项核对",
    ...(!trades.length ? ["没有找到可确认的已成交记录；持仓快照、报价和未成交订单不会录入"] : []),
  ];
  return { trades: resolveScreenshotTrades(trades, accounts, assets), documentWarnings };
}

export function validateScreenshotResult(value: unknown): {
  trades: ScreenshotTrade[];
  documentWarnings: string[];
} {
  if (!isRecord(value) || !Array.isArray(value.trades) || !Array.isArray(value.documentWarnings)) {
    throw new Error("识别结果格式无效，请重试");
  }
  const trades = value.trades.slice(0, 12).map((item) => validateTrade(item));
  return {
    trades,
    documentWarnings: value.documentWarnings.filter((item): item is string => typeof item === "string").slice(0, 8),
  };
}

export function resolveScreenshotTrades(
  trades: ScreenshotTrade[],
  accounts: Account[],
  assets: Asset[],
): ResolvedScreenshotTrade[] {
  return trades.map((trade) => ({
    ...trade,
    accountId: resolveAccount(trade.accountHint, accounts),
    assetId: needsAsset(trade.type) ? resolveAsset(trade.symbol, trade.assetName, assets) : null,
  }));
}

function validateTrade(value: unknown): ScreenshotTrade {
  if (!isRecord(value) || typeof value.type !== "string" || !transactionTypes.has(value.type as TransactionType)) {
    throw new Error("识别结果包含不支持的交易类型");
  }
  const currency = typeof value.currency === "string" && currencies.has(value.currency as Currency)
    ? value.currency as Currency
    : null;
  return {
    type: value.type as TransactionType,
    tradedAt: validDate(value.tradedAt),
    quantity: finiteOrNull(value.quantity),
    unitPrice: finiteOrNull(value.unitPrice),
    currency,
    fee: finiteOrNull(value.fee),
    tax: finiteOrNull(value.tax),
    totalAmount: finiteOrNull(value.totalAmount),
    symbol: stringOrNull(value.symbol),
    assetName: stringOrNull(value.assetName),
    accountHint: stringOrNull(value.accountHint),
    sourceText: stringOrNull(value.sourceText) ?? "截图识别",
    reference: stringOrNull(value.reference),
    confidence: Math.max(0, Math.min(1, finiteOrNull(value.confidence) ?? 0)),
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((item): item is string => typeof item === "string").slice(0, 8)
      : [],
  };
}

function resolveAsset(symbol: string | null, name: string | null, assets: Asset[]) {
  const normalizedSymbol = normalize(symbol);
  if (normalizedSymbol) {
    const exact = assets.find((asset) => normalize(asset.symbol) === normalizedSymbol
      || normalize(asset.providerSymbol) === normalizedSymbol);
    if (exact) return exact.id;
  }
  const normalizedName = normalize(name);
  if (!normalizedName) return null;
  const matches = assets.filter((asset) => {
    const candidate = normalize(asset.name);
    return candidate === normalizedName || candidate.includes(normalizedName) || normalizedName.includes(candidate);
  });
  return matches.length === 1 ? matches[0].id : null;
}

function findTradeAnchors(lines: string[], assets: Asset[]) {
  const anchors: Array<{ line: number; asset: Asset }> = [];
  lines.forEach((line, index) => {
    const compact = normalize(line);
    const matches = assets.filter((asset) => {
      const symbol = normalize(asset.symbol);
      const providerSymbol = normalize(asset.providerSymbol);
      const name = normalize(asset.name);
      return Boolean((symbol && compact.includes(symbol))
        || (providerSymbol && compact.includes(providerSymbol))
        || (name && compact.includes(name)));
    });
    for (const asset of matches) anchors.push({ line: index, asset });
  });
  return anchors.filter((anchor, index) => !anchors.slice(0, index).some((seen) =>
    seen.asset.id === anchor.asset.id && Math.abs(seen.line - anchor.line) <= 2));
}

function parseTradeWindow(lines: string[], anchor: number, asset: Asset | null, accounts: Account[]): ScreenshotTrade | null {
  const localLines = lines.slice(Math.max(0, anchor - 4), Math.min(lines.length, anchor + 6));
  const local = localLines.join("\n");
  const type = detectType(local, asset);
  if (!type) return null;
  const tradedAt = extractDate(local);
  const quantity = extractLabeledNumber(local, ["成交数量", "交易数量", "数量", "股数", "份额", "quantity", "qty", "shares", "units"]);
  const unitPrice = extractLabeledNumber(local, ["成交均价", "成交价格", "交易价格", "平均价", "价格", "price", "avg price", "average price", "executed at"]);
  const fee = extractLabeledNumber(local, ["手续费", "佣金", "费用", "commission", "fee"]);
  const tax = extractLabeledNumber(local, ["税费", "印花税", "tax"]);
  const totalAmount = extractLabeledNumber(local, ["成交金额", "交易金额", "总金额", "净额", "amount", "total", "net amount"]);
  const reference = extractReference(local);
  const currency = detectCurrency(local);
  const account = accounts.find((candidate) => [candidate.name, candidate.institution, candidate.maskedAccount]
    .some((value) => value && normalize(local).includes(normalize(value))));
  const warnings = [
    ...(!tradedAt ? ["日期未可靠识别"] : []),
    ...(needsQuantity(type) && quantity == null ? ["数量未可靠识别"] : []),
    ...(needsPrice(type) && unitPrice == null ? ["成交价未可靠识别"] : []),
    ...(!currency ? ["币种未在截图中明确识别，将按标的币种预填"] : []),
    ...(!account && accounts.length > 1 ? ["账户未可靠识别"] : []),
  ];
  const explicit = [tradedAt, quantity, unitPrice, currency, reference].filter((value) => value != null).length;
  return {
    type,
    tradedAt,
    quantity,
    unitPrice,
    currency,
    fee,
    tax,
    totalAmount,
    symbol: asset?.symbol ?? extractTicker(local),
    assetName: asset?.name ?? null,
    accountHint: account?.name ?? null,
    sourceText: detectSource(local),
    reference,
    confidence: Math.min(0.92, 0.35 + explicit * 0.11),
    warnings,
  };
}

function detectType(text: string, asset: Asset | null): TransactionType | null {
  if (/\b(sold?|sell)\b|卖出|已卖|赎回|redeem(?:ed|ption)?/i.test(text)) return asset?.assetType === "FUND" ? "REDEMPTION" : "SELL";
  if (/\b(buy|bought|purchase(?:d)?)\b|买入|已买|申购|认购|subscribe/i.test(text)) return asset?.assetType === "FUND" ? "SUBSCRIPTION" : "BUY";
  if (/股息|分红|dividend/i.test(text)) return "DIVIDEND";
  return null;
}

function extractDate(text: string) {
  const full = text.match(/\b(20\d{2})[-/.年](0?[1-9]|1[0-2])[-/.月](0?[1-9]|[12]\d|3[01])日?\b/);
  if (full) return validDate(`${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`);
  const european = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
  return european ? validDate(`${european[3]}-${european[2].padStart(2, "0")}-${european[1].padStart(2, "0")}`) : null;
}

function extractLabeledNumber(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}\\s*(?:[:：=]|为|is)?\\s*(?:US\\$|HK\\$|CN¥|RMB|USD|HKD|CNY|EUR|[$¥€£])?\\s*([0-9][0-9,.]*(?:\\.[0-9]+)?)`, "i"));
    if (match) return parseNumber(match[1]);
  }
  return null;
}

function extractReference(text: string) {
  return text.match(/(?:订单号|委托编号|成交编号|参考号|order\s*(?:id|no\.?|number)|reference)\s*[:：#]?\s*([A-Z0-9-]{4,})/i)?.[1] ?? null;
}

function extractTicker(text: string) {
  const candidate = text.match(/(?:代码|symbol|ticker)\s*[:：]?\s*([A-Z][A-Z0-9.-]{1,9})\b/i)?.[1];
  return candidate ?? null;
}

function detectCurrency(text: string): Currency | null {
  if (/HK\$|\bHKD\b|港元|港币/i.test(text)) return "HKD";
  if (/CN¥|\bCNY\b|\bRMB\b|人民币/i.test(text)) return "CNY";
  if (/€|\bEUR\b|欧元/i.test(text)) return "EUR";
  if (/US\$|\bUSD\b|美元/i.test(text)) return "USD";
  return null;
}

function detectSource(text: string) {
  if (/HSBC|汇丰/i.test(text)) return "HSBC HK · 本地 OCR";
  if (/支付宝|Alipay/i.test(text)) return "支付宝 · 本地 OCR";
  if (/Interactive Brokers|IBKR/i.test(text)) return "IBKR · 本地 OCR";
  return "交易截图 · 本地 OCR";
}

function normalizeOcrText(text: string) {
  return text.normalize("NFKC").replace(/\r/g, "").replace(/[ \t]+/g, " ");
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function needsQuantity(type: TransactionType) {
  return ["BUY", "SELL", "SUBSCRIPTION", "REDEMPTION", "SPLIT"].includes(type);
}

function needsPrice(type: TransactionType) {
  return ["BUY", "SELL", "SUBSCRIPTION", "REDEMPTION"].includes(type);
}

function uniqueTrades(trades: ScreenshotTrade[]) {
  const seen = new Set<string>();
  return trades.filter((trade) => {
    const key = [trade.type, trade.tradedAt, trade.symbol, trade.quantity, trade.unitPrice, trade.reference].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveAccount(hint: string | null, accounts: Account[]) {
  if (accounts.length === 1) return accounts[0].id;
  const normalizedHint = normalize(hint);
  if (!normalizedHint) return null;
  const matches = accounts.filter((account) => [account.name, account.institution, account.maskedAccount]
    .some((value) => {
      const candidate = normalize(value);
      return candidate && (candidate.includes(normalizedHint) || normalizedHint.includes(candidate));
    }));
  return matches.length === 1 ? matches[0].id : null;
}

function needsAsset(type: TransactionType) {
  return ["BUY", "SELL", "DIVIDEND", "SUBSCRIPTION", "REDEMPTION", "SPLIT"].includes(type);
}

function normalize(value: string | null | undefined) {
  return (value ?? "").toLocaleUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

function validDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

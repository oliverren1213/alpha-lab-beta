import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});
after(() => vite.close());

const { calculatePortfolio, currencyRate, runScenario } =
  await vite.ssrLoadModule("/lib/portfolio.ts");
const { scheduledRomeMode, olderThan90Minutes } =
  await vite.ssrLoadModule("/lib/schedule.ts");
const { parseCsv, stringifyCsv } = await vite.ssrLoadModule("/lib/csv.ts");
const { transactionFingerprint } = await vite.ssrLoadModule("/lib/transaction-fingerprint.ts");
const { createGuestToken, verifyGuestToken } = await vite.ssrLoadModule("/lib/guest-session.ts");
const { installTranslations, translateText } = await vite.ssrLoadModule("/lib/i18n.ts");
const { normalizeTradeDate, transactionAmountPreview } =
  await vite.ssrLoadModule("/lib/transaction-form.ts");
const { FinnhubQuoteProvider, previousTradingDate } =
  await vite.ssrLoadModule("/lib/providers.ts");

const account = {
  id: "account-usd",
  name: "Primary",
  institution: "Test institution",
  baseCurrency: "USD",
  maskedAccount: null,
  isDemo: false,
};

const stock = {
  id: "asset-stock",
  symbol: "STK",
  name: "Fixture Stock",
  assetType: "STOCK",
  currency: "USD",
  sector: "Technology",
  providerSymbol: "STK",
  isLeveraged: false,
  leverageTarget: null,
  isDemo: false,
};

function tx(id, type, overrides = {}) {
  return {
    id,
    accountId: account.id,
    assetId: ["CASH_IN", "CASH_OUT", "FEE", "DIVIDEND_TAX"].includes(type) ? null : stock.id,
    type,
    tradedAt: `2026-01-${String(Number(id.replace(/\D/g, "")) || 1).padStart(2, "0")}T12:00:00Z`,
    settlementDate: null,
    quantity: 0,
    unitPrice: null,
    currency: "USD",
    fee: 0,
    tax: 0,
    fxToBase: 1,
    totalAmount: null,
    source: "Fixed test fixture",
    importBatchId: null,
    note: null,
    reconciled: true,
    isDemo: false,
    ...overrides,
  };
}

function price(assetId, priceDate, value, overrides = {}) {
  return {
    assetId,
    priceDate,
    fetchedAt: `${priceDate}T22:00:00Z`,
    provider: "Fixed test fixture",
    quotedAt: null,
    session: "MORNING",
    dataQuality: "OFFICIAL_CLOSE",
    isDelayed: false,
    price: value,
    nav: null,
    currency: "USD",
    status: "FRESH",
    isDemo: false,
    ...overrides,
  };
}

function summary(transactions, prices, options = {}) {
  return calculatePortfolio({
    accounts: options.accounts ?? [account],
    assets: options.assets ?? [stock],
    transactions,
    prices,
    fxRates: options.fxRates ?? [],
    costMethod: options.costMethod ?? "WEIGHTED_AVERAGE",
  });
}

const tradingTransactions = [
  tx("1", "CASH_IN", { totalAmount: 10_000 }),
  tx("2", "BUY", { quantity: 10, unitPrice: 100, fee: 10 }),
  tx("3", "BUY", { quantity: 10, unitPrice: 120, fee: 10 }),
  tx("4", "SELL", { quantity: 5, unitPrice: 150, fee: 5 }),
];
const tradingPrices = [price(stock.id, "2026-01-20", 150), price(stock.id, "2026-01-21", 160)];

test("weighted average handles fees and a partial sale", () => {
  const value = summary(tradingTransactions, tradingPrices);
  assert.equal(value.positions[0].quantity, 15);
  assert.equal(value.positions[0].costBasisUsd, 1_665);
  assert.equal(value.positions[0].costBasisLocal, 1_665);
  assert.equal(value.realizedPnlUsd, 190);
  assert.equal(value.unrealizedPnlUsd, 735);
  assert.equal(value.todayPnlUsd, 150);
  assert.equal(value.feesUsd, 25);
});

test("FIFO consumes the oldest lot without mixing methods", () => {
  const value = summary(tradingTransactions, tradingPrices, { costMethod: "FIFO" });
  assert.equal(value.positions[0].quantity, 15);
  assert.equal(value.positions[0].costBasisUsd, 1_715);
  assert.equal(value.realizedPnlUsd, 240);
  assert.equal(value.unrealizedPnlUsd, 685);
});

test("selling out and buying back starts a new cost basis", () => {
  const value = summary([
    tx("1", "CASH_IN", { totalAmount: 2_000 }),
    tx("2", "BUY", { quantity: 10, unitPrice: 100 }),
    tx("3", "SELL", { quantity: 10, unitPrice: 110 }),
    tx("4", "BUY", { quantity: 5, unitPrice: 90 }),
  ], [price(stock.id, "2026-01-20", 90), price(stock.id, "2026-01-21", 95)]);
  assert.equal(value.positions[0].quantity, 5);
  assert.equal(value.positions[0].costBasisUsd, 450);
  assert.equal(value.realizedPnlUsd, 100);
  assert.equal(value.unrealizedPnlUsd, 25);
});

test("dividend withholding and standalone fees are counted once", () => {
  const value = summary([
    tx("1", "CASH_IN", { totalAmount: 1_000 }),
    tx("2", "BUY", { quantity: 5, unitPrice: 100 }),
    tx("3", "DIVIDEND", { assetId: stock.id, totalAmount: 20 }),
    tx("4", "DIVIDEND_TAX", { totalAmount: 3, tax: 3 }),
    tx("5", "FEE", { totalAmount: 2, fee: 2 }),
  ], [price(stock.id, "2026-01-20", 99), price(stock.id, "2026-01-21", 100)]);
  assert.equal(value.dividendIncomeUsd, 20);
  assert.equal(value.withholdingTaxUsd, 3);
  assert.equal(value.feesUsd, 2);
  assert.equal(value.cumulativePnlUsd, 15);
});

test("a split preserves total cost and changes unit cost", () => {
  const value = summary([
    tx("1", "CASH_IN", { totalAmount: 2_000 }),
    tx("2", "BUY", { quantity: 10, unitPrice: 100 }),
    tx("3", "SPLIT", { quantity: 2, unitPrice: null }),
  ], [price(stock.id, "2026-01-20", 50), price(stock.id, "2026-01-21", 60)]);
  assert.equal(value.positions[0].quantity, 20);
  assert.equal(value.positions[0].costBasisUsd, 1_000);
  assert.equal(value.positions[0].averageCostLocal, 50);
});

test("fund subscription and redemption use NAV without inventing a market price", () => {
  const fund = { ...stock, id: "asset-fund", symbol: "FUND", assetType: "FUND", currency: "CNY" };
  const transactions = [
    tx("1", "CASH_IN", { totalAmount: 1_000 }),
    tx("2", "SUBSCRIPTION", { assetId: fund.id, quantity: 100, unitPrice: 1.2, currency: "CNY", fxToBase: 0.14 }),
    tx("3", "REDEMPTION", { assetId: fund.id, quantity: 20, unitPrice: 1.5, currency: "CNY", fxToBase: 0.14 }),
  ];
  const prices = [
    price(fund.id, "2026-01-20", null, { nav: 1.3, currency: "CNY", session: "NAV", dataQuality: "NAV" }),
    price(fund.id, "2026-01-21", null, { nav: 1.4, currency: "CNY", session: "NAV", dataQuality: "NAV" }),
  ];
  const fxRates = [{ baseCurrency: "USD", quoteCurrency: "CNY", rateDate: "2026-01-21", rate: 7.2, provider: "ECB fixture", status: "FRESH", isDemo: false }];
  const value = summary(transactions, prices, { assets: [fund], fxRates });
  assert.equal(value.positions[0].quantity, 80);
  assert.ok(Math.abs(value.positions[0].costBasisLocal - 96) < 1e-9);
  assert.ok(Math.abs(value.realizedPnlUsd - 0.84) < 1e-9);
  assert.equal(value.positions[0].priceDate, "2026-01-21");
  assert.equal(value.positions[0].priceDataQuality, "NAV");
});

test("multi-currency valuation uses current FX and preserves FX attribution", () => {
  const hkdAccount = { ...account, id: "account-hkd", baseCurrency: "HKD" };
  const hkdStock = { ...stock, id: "asset-hkd", symbol: "HKSTK", currency: "HKD" };
  const value = summary([
    tx("1", "CASH_IN", { accountId: hkdAccount.id, totalAmount: 2_000 }),
    tx("2", "BUY", { accountId: hkdAccount.id, assetId: hkdStock.id, quantity: 100, unitPrice: 10, currency: "HKD", fxToBase: 0.125 }),
  ], [price(hkdStock.id, "2026-01-20", 11, { currency: "HKD" }), price(hkdStock.id, "2026-01-21", 12, { currency: "HKD" })], {
    accounts: [hkdAccount],
    assets: [hkdStock],
    fxRates: [{ baseCurrency: "USD", quoteCurrency: "HKD", rateDate: "2026-01-21", rate: 7.5, provider: "ECB fixture", status: "FRESH", isDemo: false }],
  });
  assert.equal(value.positions[0].marketValueUsd, 160);
  assert.equal(value.positions[0].unrealizedUsd, 35);
  assert.ok(Math.abs(value.positions[0].fxPnlUsd - 10) < 1e-9);
});

test("cash transfers change capital but not investment return", () => {
  const value = summary([tx("1", "CASH_IN", { totalAmount: 1_000 })], []);
  assert.equal(value.netContributionsUsd, 1_000);
  assert.equal(value.totalValueUsd, 1_000);
  assert.equal(value.cumulativePnlUsd, 0);
});

test("missing price never silently becomes zero", () => {
  const value = summary([
    tx("1", "CASH_IN", { totalAmount: 1_000 }),
    tx("2", "BUY", { quantity: 2, unitPrice: 100 }),
  ], []);
  assert.equal(value.totalValueUsd, null);
  assert.deepEqual(value.missingAssetIds, [stock.id]);
});

test("afternoon PnL compares with the latest official close", () => {
  const value = summary([
    tx("1", "CASH_IN", { totalAmount: 1_000 }),
    tx("2", "BUY", { quantity: 2, unitPrice: 90 }),
  ], [
    price(stock.id, "2026-01-20", 100, { fetchedAt: "2026-01-21T08:15:00Z" }),
    price(stock.id, "2026-01-21", 105, { fetchedAt: "2026-01-21T17:15:00Z", quotedAt: "2026-01-21T17:14:00Z", session: "AFTERNOON", dataQuality: "FREE_REALTIME" }),
  ]);
  assert.equal(value.todayPnlUsd, 10);
  assert.equal(value.positions[0].referencePriceDate, "2026-01-20");
});

test("a later morning close does not compare against the prior afternoon quote", () => {
  const value = summary([
    tx("1", "CASH_IN", { totalAmount: 1_000 }),
    tx("2", "BUY", { quantity: 2, unitPrice: 90 }),
  ], [
    price(stock.id, "2026-01-18", 95, { fetchedAt: "2026-01-19T08:15:00Z" }),
    price(stock.id, "2026-01-19", 101, { fetchedAt: "2026-01-19T17:15:00Z", session: "AFTERNOON", dataQuality: "FREE_REALTIME" }),
    price(stock.id, "2026-01-19", 100, { fetchedAt: "2026-01-20T08:15:00Z", session: "MORNING" }),
  ]);
  assert.equal(value.positions[0].price, 100);
  assert.equal(value.todayPnlUsd, 10);
  assert.equal(value.positions[0].referencePriceDate, "2026-01-18");
});

test("currency graph supports direct and inverse conversions", () => {
  const rates = [
    { baseCurrency: "USD", quoteCurrency: "EUR", rateDate: "2026-01-21", rate: 0.85 },
    { baseCurrency: "USD", quoteCurrency: "CNY", rateDate: "2026-01-21", rate: 7.2 },
  ];
  assert.equal(currencyRate("USD", "EUR", rates), 0.85);
  assert.ok(Math.abs(currencyRate("EUR", "CNY", rates) - (7.2 / 0.85)) < 1e-12);
  assert.throws(() => currencyRate("HKD", "EUR", rates), /Missing FX path/);
});

test("TQQQ scenario includes the daily-reset limitation", () => {
  const tqqqSummary = {
    totalValueUsd: 1_000,
    positions: [{ symbol: "TQQQ", sector: "Technology", currency: "USD", marketValueUsd: 1_000 }],
  };
  const result = runScenario(tqqqSummary, { ...emptyScenario(), qqqPct: -0.1 });
  assert.ok(Math.abs(result.changeUsd + 300) < 1e-9);
  assert.match(result.warning, /one-day 3x approximation/);
  assert.match(result.warning, /daily resets/);
});

test("Rome schedule handles winter and summer UTC offsets", () => {
  assert.equal(scheduledRomeMode(new Date("2026-01-15T08:15:00Z"), 0), "MORNING");
  assert.equal(scheduledRomeMode(new Date("2026-07-15T07:15:00Z"), 0), "MORNING");
  assert.equal(scheduledRomeMode(new Date("2026-01-15T17:15:00Z"), 0), "AFTERNOON");
  assert.equal(scheduledRomeMode(new Date("2026-07-15T16:15:00Z"), 0), "AFTERNOON");
  assert.equal(scheduledRomeMode(new Date("2026-07-15T12:00:00Z"), 0), null);
});

test("stale check uses the required 90-minute threshold", () => {
  const now = Date.parse("2026-01-21T12:00:00Z");
  assert.equal(olderThan90Minutes("2026-01-21T10:31:00Z", now), false);
  assert.equal(olderThan90Minutes("2026-01-21T10:29:00Z", now), true);
  assert.equal(olderThan90Minutes(null, now), true);
});

test("US holiday and weekend resolution returns the last trading date", () => {
  assert.equal(
    previousTradingDate(new Date("2026-12-28T08:00:00Z"), new Set(["2026-12-25"])),
    "2026-12-24",
  );
});

test("Finnhub retries an HTTP-200 quota payload before accepting a quote", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => Response.json(
    ++calls === 1
      ? { error: "temporary quota response" }
      : { c: 123.45, pc: 120, t: 1_767_816_000 },
  );
  try {
    const value = await new FinnhubQuoteProvider("test-key")
      .getPrice(stock, "AFTERNOON", new Set());
    assert.equal(calls, 2);
    assert.equal(value.price, 123.45);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CSV round-trip keeps quoted commas and line breaks", () => {
  const rows = [{ symbol: "STK", note: "alpha, beta\nconfirmed" }];
  const text = stringifyCsv(rows, ["symbol", "note"]);
  assert.deepEqual(parseCsv(text), [{ symbol: "STK", note: "alpha, beta\nconfirmed" }]);
});

test("trade fingerprint ignores time, notes and numeric formatting", () => {
  const first = tx("1", "BUY", {
    tradedAt: "2026-08-19T12:00:00+02:00",
    quantity: 1,
    unitPrice: 72.30,
    note: "first source",
  });
  const duplicate = tx("2", "BUY", {
    tradedAt: "2026-08-19T21:45:00Z",
    quantity: 1.0,
    unitPrice: 72.3,
    note: "different source",
  });
  const differentTrade = { ...duplicate, type: "SELL" };
  assert.equal(transactionFingerprint(first), transactionFingerprint(duplicate));
  assert.notEqual(transactionFingerprint(first), transactionFingerprint(differentTrade));
});

test("guest sessions are signed and reject tampering", async () => {
  const session = await createGuestToken("test-secret-with-enough-entropy", "11111111-1111-4111-8111-111111111111");
  assert.equal(await verifyGuestToken("test-secret-with-enough-entropy", session.token), session.ownerId);
  assert.equal(await verifyGuestToken("test-secret-with-enough-entropy", `${session.token}x`), null);
});

test("the bilingual UI ships with an installable English translator", () => {
  assert.equal(typeof installTranslations, "function");
  assert.equal(translateText("组合总览", "en"), "Portfolio overview");
  assert.equal(translateText("3 笔交易待核对", "en"), "3 transactions need review");
  assert.equal(translateText("关于项目", "en"), "About the project");
  assert.equal(translateText("Record a trade", "zh"), "直接试录交易");
  assert.equal(translateText("Portfolio overview", "zh"), "组合总览");
});

test("transaction form keeps broker dates stable and previews cash impact", () => {
  assert.equal(normalizeTradeDate("2026-08-20"), "2026-08-20");
  assert.equal(normalizeTradeDate("2028-02-29"), "2028-02-29");
  assert.throws(() => normalizeTradeDate("2026-02-30"), /有效的成交日期/);
  assert.throws(() => normalizeTradeDate(""), /有效的成交日期/);

  assert.deepEqual(transactionAmountPreview({
    type: "BUY", quantity: 1, unitPrice: 70.5, totalAmount: null, fee: 0, tax: 0,
  }), { gross: 70.5, cashChange: -70.5 });
  assert.deepEqual(transactionAmountPreview({
    type: "SELL", quantity: 1, unitPrice: 77, totalAmount: null, fee: 1, tax: 0.2,
  }), { gross: 77, cashChange: 75.8 });
  assert.deepEqual(transactionAmountPreview({
    type: "CASH_IN", quantity: null, unitPrice: null, totalAmount: 1_000, fee: 2, tax: 0,
  }), { gross: 1_000, cashChange: 998 });
  assert.equal(transactionAmountPreview({
    type: "SPLIT", quantity: 3, unitPrice: null, totalAmount: null, fee: 0, tax: 0,
  }), null);
});

test("database schema enforces per-user session uniqueness and contains no active demo seed", async () => {
  const [schema, database] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/database.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /uq_price_owner_asset_date_provider_session/);
  assert.match(schema, /uq_portfolio_owner_date_currency_session/);
  assert.match(schema, /ownerId: text\("owner_id"\)\.notNull\(\)/);
  assert.doesNotMatch(database, /seedDemo|demo-price|DEMO fixture/);
  assert.match(database, /benchmarks: benchmarksRaw\.map\(mapBenchmark\)/);
});

function emptyScenario() {
  return {
    qqqPct: 0,
    semiconductorPct: 0,
    usdCnyPct: 0,
    usdHkdPct: 0,
    eurUsdPct: 0,
    addedCashUsd: 0,
    specific: {},
  };
}

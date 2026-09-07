import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  institution: text("institution").notNull(),
  baseCurrency: text("base_currency").notNull(),
  maskedAccount: text("masked_account"),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_accounts_owner").on(table.ownerId)]);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    assetType: text("asset_type").notNull(),
    currency: text("currency").notNull(),
    sector: text("sector"),
    providerSymbol: text("provider_symbol"),
    isLeveraged: integer("is_leveraged", { mode: "boolean" })
      .notNull()
      .default(false),
    leverageTarget: real("leverage_target"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_assets_symbol_currency").on(table.symbol, table.currency),
    index("idx_assets_type").on(table.assetType),
  ],
);

export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  source: text("source").notNull(),
  filename: text("filename"),
  status: text("status").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  confirmedAt: text("confirmed_at"),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_import_batches_owner_created").on(table.ownerId, table.createdAt)]);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    assetId: text("asset_id").references(() => assets.id),
    type: text("type").notNull(),
    tradedAt: text("traded_at").notNull(),
    settlementDate: text("settlement_date"),
    quantity: real("quantity").notNull().default(0),
    unitPrice: real("unit_price"),
    currency: text("currency").notNull(),
    fee: real("fee").notNull().default(0),
    tax: real("tax").notNull().default(0),
    fxToBase: real("fx_to_base"),
    totalAmount: real("total_amount"),
    source: text("source").notNull(),
    importBatchId: text("import_batch_id").references(() => importBatches.id),
    note: text("note"),
    reconciled: integer("reconciled", { mode: "boolean" })
      .notNull()
      .default(false),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_transactions_owner_date").on(table.ownerId, table.tradedAt),
    index("idx_transactions_account_date").on(table.accountId, table.tradedAt),
    index("idx_transactions_asset_date").on(table.assetId, table.tradedAt),
    index("idx_transactions_import_batch").on(table.importBatchId),
  ],
);

export const cashFlows = sqliteTable(
  "cash_flows",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    transactionId: text("transaction_id").references(() => transactions.id),
    type: text("type").notNull(),
    occurredAt: text("occurred_at").notNull(),
    amount: real("amount").notNull(),
    currency: text("currency").notNull(),
    fxToBase: real("fx_to_base"),
    external: integer("external", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_cash_flows_account_date").on(table.accountId, table.occurredAt)],
);

export const positions = sqliteTable(
  "positions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    costMethod: text("cost_method").notNull(),
    quantity: real("quantity").notNull(),
    costBase: real("cost_base").notNull(),
    asOf: text("as_of").notNull(),
  },
  (table) => [
    uniqueIndex("uq_positions_account_asset_method").on(
      table.accountId,
      table.assetId,
      table.costMethod,
    ),
  ],
);

export const priceSnapshots = sqliteTable(
  "price_snapshots",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull().default("GLOBAL"),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    priceDate: text("price_date").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    provider: text("provider").notNull(),
    quotedAt: text("quoted_at"),
    session: text("session").notNull().default("MORNING"),
    dataQuality: text("data_quality").notNull().default("OFFICIAL_CLOSE"),
    isDelayed: integer("is_delayed", { mode: "boolean" }).notNull().default(false),
    price: real("price"),
    nav: real("nav"),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    uniqueIndex("uq_price_owner_asset_date_provider_session").on(
      table.ownerId,
      table.assetId,
      table.priceDate,
      table.provider,
      table.session,
    ),
    index("idx_price_asset_date").on(table.assetId, table.priceDate),
  ],
);

export const valuationSnapshots = sqliteTable(
  "valuation_snapshots",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    asOfDate: text("as_of_date").notNull(),
    provider: text("provider").notNull(),
    marketCap: real("market_cap"),
    trailingPe: real("trailing_pe"),
    forwardPe: real("forward_pe"),
    priceSales: real("price_sales"),
    evEbitda: real("ev_ebitda"),
    earningsYield: real("earnings_yield"),
    revenueGrowth: real("revenue_growth"),
    epsGrowth: real("eps_growth"),
    high52w: real("high_52w"),
    low52w: real("low_52w"),
    expenseRatio: real("expense_ratio"),
    trackingIndex: text("tracking_index"),
    leverageTarget: real("leverage_target"),
    maxDrawdown: real("max_drawdown"),
    status: text("status").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_valuation_asset_date_provider").on(
      table.assetId,
      table.asOfDate,
      table.provider,
    ),
  ],
);

export const fxRates = sqliteTable(
  "fx_rates",
  {
    id: text("id").primaryKey(),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rateDate: text("rate_date").notNull(),
    rate: real("rate").notNull(),
    provider: text("provider").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    status: text("status").notNull(),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    uniqueIndex("uq_fx_pair_date_provider").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.rateDate,
      table.provider,
    ),
  ],
);

export const portfolioSnapshots = sqliteTable(
  "portfolio_snapshots",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    snapshotDate: text("snapshot_date").notNull(),
    baseCurrency: text("base_currency").notNull(),
    totalValue: real("total_value").notNull(),
    netContributions: real("net_contributions").notNull(),
    realizedPnl: real("realized_pnl").notNull(),
    unrealizedPnl: real("unrealized_pnl").notNull(),
    dividendIncome: real("dividend_income").notNull(),
    feeAndTax: real("fee_and_tax").notNull(),
    fxPnl: real("fx_pnl").notNull(),
    status: text("status").notNull(),
    session: text("session").notNull().default("MORNING"),
    createdAt: text("created_at").notNull(),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    uniqueIndex("uq_portfolio_owner_date_currency_session").on(
      table.ownerId,
      table.snapshotDate,
      table.baseCurrency,
      table.session,
    ),
  ],
);

export const theses = sqliteTable(
  "theses",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    decisionType: text("decision_type").notNull(),
    openedAt: text("opened_at").notNull(),
    horizon: text("horizon").notNull(),
    maxLoss: real("max_loss"),
    plannedWeight: real("planned_weight"),
    confidence: integer("confidence").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_theses_owner_status").on(table.ownerId, table.status),
    index("idx_theses_asset_status").on(table.assetId, table.status),
  ],
);

export const thesisRevisions = sqliteTable(
  "thesis_revisions",
  {
    id: text("id").primaryKey(),
    thesisId: text("thesis_id")
      .notNull()
      .references(() => theses.id),
    revisedAt: text("revised_at").notNull(),
    buyReason: text("buy_reason").notNull(),
    mispricing: text("mispricing"),
    catalysts: text("catalysts"),
    risks: text("risks").notNull(),
    invalidation: text("invalidation").notNull(),
    sources: text("sources"),
    status: text("status").notNull(),
    note: text("note"),
  },
  (table) => [index("idx_thesis_revisions_thesis_date").on(table.thesisId, table.revisedAt)],
);

export const decisionReviews = sqliteTable(
  "decision_reviews",
  {
    id: text("id").primaryKey(),
    thesisId: text("thesis_id")
      .notNull()
      .references(() => theses.id),
    dueAt: text("due_at").notNull(),
    horizonDays: integer("horizon_days").notNull(),
    expectation: text("expectation"),
    actual: text("actual"),
    thesisAssessment: text("thesis_assessment"),
    timingAssessment: text("timing_assessment"),
    sizingAssessment: text("sizing_assessment"),
    bias: text("bias"),
    relativeQqq: real("relative_qqq"),
    relativeSpy: real("relative_spy"),
    processGrade: text("process_grade"),
    confirmed: integer("confirmed", { mode: "boolean" }).notNull().default(false),
    completedAt: text("completed_at"),
  },
  (table) => [index("idx_decision_reviews_due").on(table.dueAt, table.confirmed)],
);

export const benchmarkSnapshots = sqliteTable(
  "benchmark_snapshots",
  {
    id: text("id").primaryKey(),
    symbol: text("symbol").notNull(),
    priceDate: text("price_date").notNull(),
    close: real("close").notNull(),
    provider: text("provider").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    uniqueIndex("uq_benchmark_symbol_date_provider").on(
      table.symbol,
      table.priceDate,
      table.provider,
    ),
  ],
);

export const dataSources = sqliteTable("data_sources", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  provider: text("provider").notNull(),
  label: text("label").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  delayDescription: text("delay_description").notNull(),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error"),
});

export const updateRuns = sqliteTable(
  "update_runs",
  {
    id: text("id").primaryKey(),
    trigger: text("trigger").notNull(),
    mode: text("mode").notNull().default("MORNING"),
    status: text("status").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    errorSummary: text("error_summary"),
  },
  (table) => [index("idx_update_runs_started").on(table.startedAt)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

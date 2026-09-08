import { env } from "cloudflare:workers";
import type {
  Account,
  Asset,
  BenchmarkSnapshot,
  Currency,
  DataSourceStatus,
  FxSnapshot,
  ImportBatchSummary,
  LabData,
  LedgerTransaction,
  PortfolioHistoryPoint,
  PriceSnapshot,
  ThesisRecord,
  TransactionType,
  UpdateStatus,
} from "./types";
import { transactionFingerprint } from "./transaction-fingerprint";

type RuntimeEnv = {
  DB?: D1Database;
  CRON_SECRET?: string;
  ALLOW_DEV_REFRESH?: string;
  ALPHA_VANTAGE_API_KEY?: string;
  ALPHA_VANTAGE_THROTTLE_MS?: string;
  FINNHUB_API_KEY?: string;
  GUEST_SESSION_SECRET?: string;
};

export function getRuntimeEnv() {
  return env as unknown as RuntimeEnv;
}

export function getDatabase() {
  const database = getRuntimeEnv().DB;
  if (!database) throw new Error("D1 database binding DB is unavailable");
  return database;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, institution TEXT NOT NULL,
    base_currency TEXT NOT NULL, masked_account TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY, symbol TEXT NOT NULL, name TEXT NOT NULL, asset_type TEXT NOT NULL,
    currency TEXT NOT NULL, sector TEXT, provider_symbol TEXT, is_leveraged INTEGER NOT NULL DEFAULT 0,
    leverage_target REAL, is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
    UNIQUE(symbol, currency)
  )`,
  `CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY, source TEXT NOT NULL, filename TEXT, status TEXT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0, confirmed_at TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
    asset_id TEXT REFERENCES assets(id), type TEXT NOT NULL, traded_at TEXT NOT NULL,
    settlement_date TEXT, quantity REAL NOT NULL DEFAULT 0, unit_price REAL,
    currency TEXT NOT NULL, fee REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0,
    fx_to_base REAL, total_amount REAL, source TEXT NOT NULL,
    import_batch_id TEXT REFERENCES import_batches(id), note TEXT,
    reconciled INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cash_flows (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
    transaction_id TEXT REFERENCES transactions(id), type TEXT NOT NULL, occurred_at TEXT NOT NULL,
    amount REAL NOT NULL, currency TEXT NOT NULL, fx_to_base REAL,
    external INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
    asset_id TEXT NOT NULL REFERENCES assets(id), cost_method TEXT NOT NULL,
    quantity REAL NOT NULL, cost_base REAL NOT NULL, as_of TEXT NOT NULL,
    UNIQUE(account_id, asset_id, cost_method)
  )`,
  `CREATE TABLE IF NOT EXISTS price_snapshots (
    id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), price_date TEXT NOT NULL,
    fetched_at TEXT NOT NULL, provider TEXT NOT NULL, quoted_at TEXT,
    session TEXT NOT NULL DEFAULT 'MORNING', data_quality TEXT NOT NULL DEFAULT 'OFFICIAL_CLOSE',
    is_delayed INTEGER NOT NULL DEFAULT 0, price REAL, nav REAL,
    currency TEXT NOT NULL, status TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0,
    UNIQUE(asset_id, price_date, provider, session)
  )`,
  `CREATE TABLE IF NOT EXISTS valuation_snapshots (
    id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), as_of_date TEXT NOT NULL,
    provider TEXT NOT NULL, market_cap REAL, trailing_pe REAL, forward_pe REAL,
    price_sales REAL, ev_ebitda REAL, earnings_yield REAL, revenue_growth REAL,
    eps_growth REAL, high_52w REAL, low_52w REAL, expense_ratio REAL,
    tracking_index TEXT, leverage_target REAL, max_drawdown REAL,
    status TEXT NOT NULL, fetched_at TEXT NOT NULL,
    UNIQUE(asset_id, as_of_date, provider)
  )`,
  `CREATE TABLE IF NOT EXISTS fx_rates (
    id TEXT PRIMARY KEY, base_currency TEXT NOT NULL, quote_currency TEXT NOT NULL,
    rate_date TEXT NOT NULL, rate REAL NOT NULL, provider TEXT NOT NULL,
    fetched_at TEXT NOT NULL, status TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0,
    UNIQUE(base_currency, quote_currency, rate_date, provider)
  )`,
  `CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id TEXT PRIMARY KEY, snapshot_date TEXT NOT NULL, base_currency TEXT NOT NULL,
    total_value REAL NOT NULL, net_contributions REAL NOT NULL, realized_pnl REAL NOT NULL,
    unrealized_pnl REAL NOT NULL, dividend_income REAL NOT NULL, fee_and_tax REAL NOT NULL,
    fx_pnl REAL NOT NULL, status TEXT NOT NULL, session TEXT NOT NULL DEFAULT 'MORNING',
    created_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0,
    UNIQUE(snapshot_date, base_currency, session)
  )`,
  `CREATE TABLE IF NOT EXISTS theses (
    id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), decision_type TEXT NOT NULL,
    opened_at TEXT NOT NULL, horizon TEXT NOT NULL, max_loss REAL, planned_weight REAL,
    confidence INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS thesis_revisions (
    id TEXT PRIMARY KEY, thesis_id TEXT NOT NULL REFERENCES theses(id), revised_at TEXT NOT NULL,
    buy_reason TEXT NOT NULL, mispricing TEXT, catalysts TEXT, risks TEXT NOT NULL,
    invalidation TEXT NOT NULL, sources TEXT, status TEXT NOT NULL, note TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS decision_reviews (
    id TEXT PRIMARY KEY, thesis_id TEXT NOT NULL REFERENCES theses(id), due_at TEXT NOT NULL,
    horizon_days INTEGER NOT NULL, expectation TEXT, actual TEXT, thesis_assessment TEXT,
    timing_assessment TEXT, sizing_assessment TEXT, bias TEXT, relative_qqq REAL,
    relative_spy REAL, process_grade TEXT, confirmed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS benchmark_snapshots (
    id TEXT PRIMARY KEY, symbol TEXT NOT NULL, price_date TEXT NOT NULL, close REAL NOT NULL,
    provider TEXT NOT NULL, fetched_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0,
    UNIQUE(symbol, price_date, provider)
  )`,
  `CREATE TABLE IF NOT EXISTS data_sources (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, provider TEXT NOT NULL, label TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1, delay_description TEXT NOT NULL,
    last_success_at TEXT, last_error TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS update_runs (
    id TEXT PRIMARY KEY, trigger TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'MORNING',
    status TEXT NOT NULL, started_at TEXT NOT NULL,
    completed_at TEXT, success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0, error_summary TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id, traded_at)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_asset_date ON transactions(asset_id, traded_at)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_import_batch ON transactions(import_batch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_price_asset_date ON price_snapshots(asset_id, price_date)`,
  `CREATE INDEX IF NOT EXISTS idx_thesis_revisions_thesis_date ON thesis_revisions(thesis_id, revised_at)`,
  `CREATE INDEX IF NOT EXISTS idx_update_runs_started ON update_runs(started_at)`,
];

// Schema creation is handled exclusively by Drizzle migrations. Keep this
// legacy reference inert so application requests can never mutate the schema.
void schemaStatements;

let ready: Promise<void> | null = null;

export async function ensureDatabase() {
  if (!ready) {
    ready = (async () => {
      const database = getDatabase();
      await ensureDataSources(database);
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  await ready;
}

async function ensureDataSources(database: D1Database) {
  await database.batch([
    database.prepare(
      `INSERT INTO data_sources
       (id,kind,provider,label,enabled,delay_description,last_success_at,last_error)
       VALUES (?,?,?,?,?,?,NULL,?)
       ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,provider=excluded.provider,
        label=excluded.label,enabled=excluded.enabled,delay_description=excluded.delay_description`,
    ).bind(
      "source-prices",
      "MARKET_PRICE",
      "Finnhub",
      "上午使用最近正式收盘价，下午使用免费行情可提供的最新报价",
      1,
      "免费个人用途接口，保留原始报价时间与数据属性",
      "尚未配置 FINNHUB_API_KEY",
    ),
    database.prepare(
      `INSERT INTO data_sources
       (id,kind,provider,label,enabled,delay_description,last_success_at,last_error)
       VALUES (?,?,?,?,?,?,NULL,NULL)
       ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,provider=excluded.provider,
        label=excluded.label,enabled=excluded.enabled,delay_description=excluded.delay_description`,
    ).bind(
      "source-fx",
      "FX",
      "Frankfurter",
      "ECB 参考汇率",
      1,
      "最近公布的工作日参考汇率",
    ),
    database.prepare(
      `INSERT INTO data_sources
       (id,kind,provider,label,enabled,delay_description,last_success_at,last_error)
       VALUES (?,?,?,?,?,?,NULL,NULL)
       ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,provider=excluded.provider,
        label=excluded.label,enabled=excluded.enabled,delay_description=excluded.delay_description`,
    ).bind(
      "source-funds",
      "FUND_NAV",
      "Confirmed manual NAV",
      "最近一次人工确认的基金 NAV",
      1,
      "无新净值时保留最近有效值及原始净值日期",
    ),
    database.prepare(
      `INSERT INTO data_sources
       (id,kind,provider,label,enabled,delay_description,last_success_at,last_error)
       VALUES (?,?,?,?,?,?,NULL,NULL)
       ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,provider=excluded.provider,
        label=excluded.label,enabled=excluded.enabled,delay_description=excluded.delay_description`,
    ).bind(
      "source-benchmarks",
      "BENCHMARK",
      "Finnhub",
      "QQQ 与 SPY 最近正式收盘基准",
      1,
      "上午更新；保留实际价格日期，不把盘中报价写成收盘价",
    ),
    database.prepare(
      `UPDATE data_sources SET last_error='尚未配置 FINNHUB_API_KEY'
       WHERE id='source-prices' AND last_error='FINNHUB_API_KEY not configured'`,
    ),
  ]);
}

export async function loadLabData(ownerId: string): Promise<LabData> {
  await ensureDatabase();
  const database = getDatabase();
  const [
    accountsRaw,
    assetsRaw,
    transactionsRaw,
    pricesRaw,
    fxRaw,
    historyRaw,
    benchmarksRaw,
    thesesRaw,
    revisionsRaw,
    sourcesRaw,
    importsRaw,
    updateRaw,
  ] =
    await Promise.all([
      all(database, "SELECT * FROM accounts WHERE owner_id=? ORDER BY created_at", [ownerId]),
      all(database, `SELECT DISTINCT a.* FROM assets a
        JOIN transactions t ON t.asset_id=a.id
        WHERE t.owner_id=? ORDER BY a.symbol`, [ownerId]),
      all(database, "SELECT * FROM transactions WHERE owner_id=? ORDER BY traded_at DESC, id DESC", [ownerId]),
      all(database, `SELECT p.* FROM price_snapshots p
        WHERE (p.owner_id='GLOBAL' OR p.owner_id=?)
          AND p.asset_id IN (SELECT asset_id FROM transactions WHERE owner_id=? AND asset_id IS NOT NULL)
        ORDER BY p.price_date DESC,p.fetched_at DESC`, [ownerId, ownerId]),
      all(database, "SELECT * FROM fx_rates ORDER BY rate_date DESC"),
      all(database, "SELECT * FROM portfolio_snapshots WHERE owner_id=? ORDER BY snapshot_date", [ownerId]),
      all(database, "SELECT * FROM benchmark_snapshots ORDER BY price_date"),
      all(
        database,
        `SELECT t.*, a.symbol,
          r.revised_at, r.buy_reason, r.mispricing, r.catalysts, r.risks,
          r.invalidation, r.sources, r.note
         FROM theses t JOIN assets a ON a.id=t.asset_id
         JOIN thesis_revisions r ON r.id=(
           SELECT r2.id FROM thesis_revisions r2 WHERE r2.thesis_id=t.id
           ORDER BY r2.revised_at DESC LIMIT 1
         ) WHERE t.owner_id=? ORDER BY t.opened_at DESC`,
        [ownerId],
      ),
      all(database, `SELECT r.* FROM thesis_revisions r JOIN theses t ON t.id=r.thesis_id
        WHERE t.owner_id=? ORDER BY r.revised_at DESC`, [ownerId]),
      all(database, "SELECT * FROM data_sources ORDER BY kind, provider"),
      all(database, "SELECT * FROM import_batches WHERE owner_id=? ORDER BY created_at DESC", [ownerId]),
      database.prepare("SELECT * FROM update_runs ORDER BY started_at DESC LIMIT 1").first<Record<string, unknown>>(),
    ]);

  const benchmarkByDate = new Map<string, { QQQ?: number; SPY?: number }>();
  for (const row of benchmarksRaw) {
    const date = String(row.price_date);
    const values = benchmarkByDate.get(date) ?? {};
    values[String(row.symbol) as "QQQ" | "SPY"] = Number(row.close);
    benchmarkByDate.set(date, values);
  }
  const history: PortfolioHistoryPoint[] = historyRaw.map((row) => ({
    date: String(row.snapshot_date),
    portfolio: Number(row.total_value),
    contributions: Number(row.net_contributions),
    qqq: benchmarkByDate.get(String(row.snapshot_date))?.QQQ ?? null,
    spy: benchmarkByDate.get(String(row.snapshot_date))?.SPY ?? null,
    status: String(row.status),
  }));

  return {
    accounts: accountsRaw.map(mapAccount),
    assets: assetsRaw.map(mapAsset),
    transactions: transactionsRaw.map(mapTransaction),
    prices: pricesRaw.map(mapPrice),
    fxRates: fxRaw.map(mapFx),
    benchmarks: benchmarksRaw.map(mapBenchmark),
    history,
    theses: thesesRaw.map((row) =>
      mapThesis(
        row,
        revisionsRaw.filter((revision) => String(revision.thesis_id) === String(row.id)),
      ),
    ),
    dataSources: sourcesRaw.map(mapDataSource),
    importBatches: importsRaw.map(mapImportBatch),
    updateStatus: updateRaw ? mapUpdate(updateRaw) : null,
    lastSuccessfulUpdateAt: await latestSuccessfulUpdate(database),
    demoMode: transactionsRaw.length > 0 && transactionsRaw.every((row) => Boolean(row.is_demo)),
    generatedAt: new Date().toISOString(),
  };
}

export async function ensureGuestDemoData(ownerId: string) {
  if (!ownerId.startsWith("guest_")) return;
  await ensureDatabase();
  const database = getDatabase();
  const existing = await database.prepare("SELECT id FROM accounts WHERE owner_id=? LIMIT 1")
    .bind(ownerId).first<{ id: string }>();
  if (existing) return;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const prior = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const bought = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const createdAt = now.toISOString();
  const accountId = id("account");
  const equityId = "asset-demo-equity";
  const techId = "asset-demo-tech";
  await database.batch([
    database.prepare(
      "INSERT OR IGNORE INTO assets (id,symbol,name,asset_type,currency,sector,provider_symbol,is_leveraged,leverage_target,is_demo,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(equityId, "DEMO-EQ", "全球股票组合（演示）", "ETF", "USD", "Diversified", null, 0, null, 1, createdAt),
    database.prepare(
      "INSERT OR IGNORE INTO assets (id,symbol,name,asset_type,currency,sector,provider_symbol,is_leveraged,leverage_target,is_demo,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(techId, "DEMO-TECH", "科技成长组合（演示）", "STOCK", "USD", "Technology", null, 0, null, 1, createdAt),
    database.prepare(
      "INSERT INTO accounts (id,owner_id,name,institution,base_currency,masked_account,is_demo,created_at) VALUES (?,?,?,?,?,?,?,?)",
    ).bind(accountId, ownerId, "访客演示账户", "Alpha Lab Sandbox", "USD", "DEMO", 1, createdAt),
    database.prepare(
      `INSERT INTO transactions
       (id,owner_id,account_id,asset_id,type,traded_at,settlement_date,quantity,unit_price,currency,fee,tax,fx_to_base,total_amount,source,import_batch_id,note,reconciled,is_demo,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id("tx"), ownerId, accountId, null, "CASH_IN", bought, null, 0, null, "USD", 0, 0, 1, 10_000, "Demo fixture", null, "明确标注的访客演示数据", 1, 1, createdAt, createdAt),
    database.prepare(
      `INSERT INTO transactions
       (id,owner_id,account_id,asset_id,type,traded_at,settlement_date,quantity,unit_price,currency,fee,tax,fx_to_base,total_amount,source,import_batch_id,note,reconciled,is_demo,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id("tx"), ownerId, accountId, equityId, "BUY", bought, null, 12, 220, "USD", 2, 0, 1, null, "Demo fixture", null, "明确标注的访客演示数据", 1, 1, createdAt, createdAt),
    database.prepare(
      `INSERT INTO transactions
       (id,owner_id,account_id,asset_id,type,traded_at,settlement_date,quantity,unit_price,currency,fee,tax,fx_to_base,total_amount,source,import_batch_id,note,reconciled,is_demo,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id("tx"), ownerId, accountId, techId, "BUY", bought, null, 8, 310, "USD", 2, 0, 1, null, "Demo fixture", null, "明确标注的访客演示数据", 1, 1, createdAt, createdAt),
    ...[
      [equityId, prior, "MORNING", 228],
      [equityId, today, "AFTERNOON", 232],
      [techId, prior, "MORNING", 302],
      [techId, today, "AFTERNOON", 298],
    ].map(([assetId, date, session, price]) => database.prepare(
      `INSERT INTO price_snapshots
       (id,owner_id,asset_id,price_date,fetched_at,provider,quoted_at,session,data_quality,is_delayed,price,nav,currency,status,is_demo)
       VALUES (?,?,?,?,?,?,NULL,?,'DEMO',0,?,NULL,'USD','FRESH',1)`,
    ).bind(id("price"), ownerId, assetId, date, createdAt, "Clearly labeled demo fixture", session, price)),
  ]);
}

export async function all(database: D1Database, sql: string, values: unknown[] = []) {
  const result = await database.prepare(sql).bind(...values).all<Record<string, unknown>>();
  return result.results ?? [];
}

export async function execute(sql: string, values: unknown[] = []) {
  await ensureDatabase();
  return getDatabase().prepare(sql).bind(...values).run();
}

export function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export type TransactionInput = {
  id?: string;
  accountId: string;
  assetId: string | null;
  type: TransactionType;
  tradedAt: string;
  settlementDate?: string | null;
  quantity?: number;
  unitPrice?: number | null;
  currency: Currency;
  fee?: number;
  tax?: number;
  fxToBase?: number | null;
  totalAmount?: number | null;
  source?: string;
  importBatchId?: string | null;
  note?: string | null;
  reconciled?: boolean;
};

export class DuplicateTransactionError extends Error {
  readonly duplicateId: string;

  constructor(duplicateId: string) {
    super("账本已有相同账户、标的、方向、交易日期、数量和成交价的记录，本次未重复写入");
    this.name = "DuplicateTransactionError";
    this.duplicateId = duplicateId;
  }
}

export async function insertTransaction(ownerId: string, input: TransactionInput) {
  validateTransactionInput(input);
  const now = new Date().toISOString();
  const transactionId = input.id ?? id("tx");
  await ensureDatabase();
  const account = await getDatabase()
    .prepare("SELECT is_demo FROM accounts WHERE id=? AND owner_id=?")
    .bind(input.accountId, ownerId)
    .first<{ is_demo: number }>();
  if (!account) throw new Error("Account does not exist");
  const duplicateId = await findDuplicateTransaction(ownerId, input);
  if (duplicateId) throw new DuplicateTransactionError(duplicateId);
  await execute(
    `INSERT INTO transactions
      (id,owner_id,account_id,asset_id,type,traded_at,settlement_date,quantity,unit_price,currency,fee,tax,fx_to_base,total_amount,source,import_batch_id,note,reconciled,is_demo,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      transactionId,
      ownerId,
      input.accountId,
      input.assetId,
      input.type,
      input.tradedAt,
      input.settlementDate ?? null,
      input.quantity ?? 0,
      input.unitPrice ?? null,
      input.currency,
      input.fee ?? 0,
      input.tax ?? 0,
      input.fxToBase ?? (input.currency === "USD" ? 1 : null),
      input.totalAmount ?? null,
      input.source ?? "Manual",
      input.importBatchId ?? null,
      input.note ?? null,
      input.reconciled ? 1 : 0,
      account.is_demo ? 1 : 0,
      now,
      now,
    ],
  );
  return transactionId;
}

export async function updateTransaction(ownerId: string, transactionId: string, input: TransactionInput) {
  validateTransactionInput(input);
  await ensureDatabase();
  const account = await getDatabase()
    .prepare("SELECT id FROM accounts WHERE id=? AND owner_id=?")
    .bind(input.accountId, ownerId)
    .first<{ id: string }>();
  if (!account) throw new Error("Account does not exist");
  const duplicateId = await findDuplicateTransaction(ownerId, input, transactionId);
  if (duplicateId) throw new DuplicateTransactionError(duplicateId);
  const result = await execute(
    `UPDATE transactions SET account_id=?,asset_id=?,type=?,traded_at=?,settlement_date=?,
      quantity=?,unit_price=?,currency=?,fee=?,tax=?,fx_to_base=?,total_amount=?,source=?,note=?,
      reconciled=?,updated_at=? WHERE id=? AND owner_id=?`,
    [
      input.accountId,
      input.assetId,
      input.type,
      input.tradedAt,
      input.settlementDate ?? null,
      input.quantity ?? 0,
      input.unitPrice ?? null,
      input.currency,
      input.fee ?? 0,
      input.tax ?? 0,
      input.fxToBase ?? (input.currency === "USD" ? 1 : null),
      input.totalAmount ?? null,
      input.source ?? "Manual",
      input.note ?? null,
      input.reconciled ? 1 : 0,
      new Date().toISOString(),
      transactionId,
      ownerId,
    ],
  );
  if (!result.meta.changes) throw new Error("Transaction does not exist");
}

export async function deleteTransaction(ownerId: string, transactionId: string) {
  await execute("DELETE FROM transactions WHERE id=? AND owner_id=?", [transactionId, ownerId]);
}

function validateTransactionInput(input: TransactionInput) {
  if (!input.accountId || !input.type || !input.tradedAt || !input.currency) {
    throw new Error("Account, type, trade date and currency are required");
  }
  const assetTypes = ["BUY", "SELL", "SUBSCRIPTION", "REDEMPTION", "DIVIDEND", "SPLIT"];
  if (assetTypes.includes(input.type) && !input.assetId) throw new Error("This transaction requires an asset");
  for (const [label, value] of [
    ["quantity", input.quantity],
    ["unit price", input.unitPrice],
    ["fee", input.fee],
    ["tax", input.tax],
    ["total amount", input.totalAmount],
  ] as const) {
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      throw new Error(`${label} must be a non-negative number`);
    }
  }
  if (input.currency !== "USD" && (input.fxToBase == null || input.fxToBase <= 0)) {
    throw new Error("A positive transaction-date FX-to-USD rate is required for non-USD entries");
  }
}

async function findDuplicateTransaction(ownerId: string, input: TransactionInput, excludeId?: string) {
  const fingerprint = transactionFingerprint({
    ...input,
    quantity: input.quantity ?? 0,
    unitPrice: input.unitPrice ?? null,
  });
  if (!fingerprint) return null;

  const tradeDate = input.tradedAt.slice(0, 10);
  const row = await getDatabase().prepare(
    `SELECT id FROM transactions
     WHERE owner_id=? AND account_id=? AND asset_id=? AND type=? AND substr(traded_at,1,10)=?
       AND quantity=? AND unit_price=? AND (? IS NULL OR id<>?)
     LIMIT 1`,
  ).bind(
    ownerId,
    input.accountId,
    input.assetId,
    input.type,
    tradeDate,
    input.quantity ?? 0,
    input.unitPrice,
    excludeId ?? null,
    excludeId ?? null,
  ).first<{ id: string }>();
  return row?.id ?? null;
}

function mapAccount(row: Record<string, unknown>): Account {
  return {
    id: String(row.id), name: String(row.name), institution: String(row.institution),
    baseCurrency: row.base_currency as Currency,
    maskedAccount: row.masked_account == null ? null : String(row.masked_account),
    isDemo: Boolean(row.is_demo),
  };
}

function mapAsset(row: Record<string, unknown>): Asset {
  return {
    id: String(row.id), symbol: String(row.symbol), name: String(row.name),
    assetType: row.asset_type as Asset["assetType"], currency: row.currency as Currency,
    sector: row.sector == null ? null : String(row.sector),
    providerSymbol: row.provider_symbol == null ? null : String(row.provider_symbol),
    isLeveraged: Boolean(row.is_leveraged),
    leverageTarget: row.leverage_target == null ? null : Number(row.leverage_target),
    isDemo: Boolean(row.is_demo),
  };
}

function mapTransaction(row: Record<string, unknown>): LedgerTransaction {
  return {
    id: String(row.id), accountId: String(row.account_id),
    assetId: row.asset_id == null ? null : String(row.asset_id),
    type: row.type as TransactionType, tradedAt: String(row.traded_at),
    settlementDate: row.settlement_date == null ? null : String(row.settlement_date),
    quantity: Number(row.quantity), unitPrice: row.unit_price == null ? null : Number(row.unit_price),
    currency: row.currency as Currency, fee: Number(row.fee), tax: Number(row.tax),
    fxToBase: row.fx_to_base == null ? null : Number(row.fx_to_base),
    totalAmount: row.total_amount == null ? null : Number(row.total_amount),
    source: String(row.source), importBatchId: row.import_batch_id == null ? null : String(row.import_batch_id),
    note: row.note == null ? null : String(row.note), reconciled: Boolean(row.reconciled),
    isDemo: Boolean(row.is_demo),
  };
}

function mapPrice(row: Record<string, unknown>): PriceSnapshot {
  return {
    assetId: String(row.asset_id), priceDate: String(row.price_date), fetchedAt: String(row.fetched_at),
    provider: String(row.provider), price: row.price == null ? null : Number(row.price),
    quotedAt: row.quoted_at == null ? null : String(row.quoted_at),
    session: String(row.session ?? "MORNING") as PriceSnapshot["session"],
    dataQuality: String(row.data_quality ?? "OFFICIAL_CLOSE") as PriceSnapshot["dataQuality"],
    isDelayed: Boolean(row.is_delayed),
    nav: row.nav == null ? null : Number(row.nav), currency: row.currency as Currency,
    status: String(row.status) as PriceSnapshot["status"], isDemo: Boolean(row.is_demo),
  };
}

function mapFx(row: Record<string, unknown>): FxSnapshot {
  return {
    baseCurrency: row.base_currency as Currency, quoteCurrency: row.quote_currency as Currency,
    rateDate: String(row.rate_date), rate: Number(row.rate), provider: String(row.provider),
    status: String(row.status) as FxSnapshot["status"], isDemo: Boolean(row.is_demo),
  };
}

function mapBenchmark(row: Record<string, unknown>): BenchmarkSnapshot {
  return {
    symbol: String(row.symbol) as BenchmarkSnapshot["symbol"],
    priceDate: String(row.price_date),
    close: Number(row.close),
    provider: String(row.provider),
    fetchedAt: String(row.fetched_at),
    isDemo: Boolean(row.is_demo),
  };
}

function mapThesis(
  row: Record<string, unknown>,
  revisions: Array<Record<string, unknown>>,
): ThesisRecord {
  const mappedRevisions = revisions.map((revision) => ({
    revisedAt: String(revision.revised_at),
    buyReason: String(revision.buy_reason),
    mispricing: revision.mispricing == null ? null : String(revision.mispricing),
    catalysts: revision.catalysts == null ? null : String(revision.catalysts),
    risks: String(revision.risks),
    invalidation: String(revision.invalidation),
    sources: revision.sources == null ? null : String(revision.sources),
    note: revision.note == null ? null : String(revision.note),
  }));
  return {
    id: String(row.id), assetId: String(row.asset_id), symbol: String(row.symbol),
    decisionType: String(row.decision_type), openedAt: String(row.opened_at), horizon: String(row.horizon),
    maxLoss: row.max_loss == null ? null : Number(row.max_loss),
    plannedWeight: row.planned_weight == null ? null : Number(row.planned_weight),
    confidence: Number(row.confidence), status: String(row.status),
    revision: {
      revisedAt: String(row.revised_at), buyReason: String(row.buy_reason),
      mispricing: row.mispricing == null ? null : String(row.mispricing),
      catalysts: row.catalysts == null ? null : String(row.catalysts), risks: String(row.risks),
      invalidation: String(row.invalidation), sources: row.sources == null ? null : String(row.sources),
      note: row.note == null ? null : String(row.note),
    },
    revisions: mappedRevisions,
  };
}

function mapUpdate(row: Record<string, unknown>): UpdateStatus {
  return {
    id: String(row.id), trigger: String(row.trigger), mode: String(row.mode ?? "MORNING"), status: String(row.status),
    startedAt: String(row.started_at), completedAt: row.completed_at == null ? null : String(row.completed_at),
    successCount: Number(row.success_count), failureCount: Number(row.failure_count),
    errorSummary: row.error_summary == null ? null : String(row.error_summary),
  };
}

function mapDataSource(row: Record<string, unknown>): DataSourceStatus {
  return {
    id: String(row.id),
    kind: String(row.kind),
    provider: String(row.provider),
    label: String(row.label),
    enabled: Boolean(row.enabled),
    delayDescription: String(row.delay_description),
    lastSuccessAt: row.last_success_at == null ? null : String(row.last_success_at),
    lastError: row.last_error == null ? null : String(row.last_error),
  };
}

function mapImportBatch(row: Record<string, unknown>): ImportBatchSummary {
  return {
    id: String(row.id),
    source: String(row.source),
    filename: row.filename == null ? null : String(row.filename),
    status: String(row.status),
    rowCount: Number(row.row_count),
    confirmedAt: row.confirmed_at == null ? null : String(row.confirmed_at),
    createdAt: String(row.created_at),
  };
}

async function latestSuccessfulUpdate(database: D1Database) {
  const row = await database.prepare(
    "SELECT completed_at FROM update_runs WHERE status IN ('SUCCESS','PARTIAL') AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1",
  ).first<{ completed_at: string }>();
  return row?.completed_at ?? null;
}

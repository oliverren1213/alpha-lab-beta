import { all, ensureDatabase, getDatabase, id } from "./database";
import { parseCsv, stringifyCsv } from "./csv";
import { transactionFingerprint } from "./transaction-fingerprint";
import type { AssetType, Currency, TransactionType } from "./types";

const csvHeaders = [
  "account_name",
  "institution",
  "masked_account",
  "symbol",
  "asset_name",
  "asset_type",
  "transaction_type",
  "traded_at",
  "settlement_date",
  "quantity",
  "unit_price",
  "currency",
  "fee",
  "tax",
  "fx_to_usd",
  "total_amount",
  "source",
  "note",
  "reconciled",
];

const transactionTypes = new Set<TransactionType>([
  "BUY", "SELL", "DIVIDEND", "DIVIDEND_TAX", "FEE", "SUBSCRIPTION",
  "REDEMPTION", "SPLIT", "CASH_IN", "CASH_OUT",
]);
const assetTypes = new Set<AssetType>(["STOCK", "ETF", "FUND", "CASH"]);
const currencies = new Set<Currency>(["USD", "HKD", "CNY", "EUR"]);

export async function importTransactionsCsv(
  ownerId: string,
  text: string,
  filename: string,
  replaceDemo: boolean,
) {
  const rawRows = parseCsv(text);
  if (!rawRows.length) throw new Error("CSV contains no data rows");
  const missing = csvHeaders.filter((header) => !(header in rawRows[0]));
  if (missing.length) throw new Error(`CSV is missing headers: ${missing.join(", ")}`);
  if (rawRows.length > 2_000) throw new Error("One import is limited to 2,000 rows");
  const rows = rawRows.map(normalizeCsvRow);
  await ensureDatabase();
  const database = getDatabase();
  const hasDemo = await database.prepare(
    "SELECT 1 AS present FROM transactions WHERE owner_id=? AND is_demo=1 LIMIT 1",
  ).bind(ownerId).first<{ present: number }>();
  if (hasDemo && !replaceDemo) {
    throw new Error("Confirm Replace DEMO data before importing a real ledger");
  }
  const existing = await all(
    database,
    `SELECT account_id,asset_id,type,traded_at,quantity,unit_price
     FROM transactions WHERE owner_id=? AND is_demo=0`,
    [ownerId],
  );
  const seen = new Set(existing.map((row) => transactionFingerprint({
    accountId: String(row.account_id),
    assetId: row.asset_id == null ? null : String(row.asset_id),
    type: row.type as TransactionType,
    tradedAt: String(row.traded_at),
    quantity: Number(row.quantity),
    unitPrice: row.unit_price == null ? null : Number(row.unit_price),
  })).filter((value): value is string => Boolean(value)));
  const uniqueRows: Array<{
    row: (typeof rows)[number];
    accountId: string;
    assetId: string | null;
  }> = [];
  let skippedDuplicates = 0;
  for (const row of rows) {
    const accountId = stableId("account", `${ownerId}:${row.institution}:${row.accountName}`);
    const assetRequired = !["CASH_IN", "CASH_OUT", "FEE", "DIVIDEND_TAX"].includes(row.type);
    const assetId = assetRequired ? stableId("asset", `${row.symbol}:${row.currency}`) : null;
    const fingerprint = transactionFingerprint({
      accountId,
      assetId,
      type: row.type,
      tradedAt: row.tradedAt,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
    });
    if (fingerprint && seen.has(fingerprint)) {
      skippedDuplicates += 1;
      continue;
    }
    if (fingerprint) seen.add(fingerprint);
    uniqueRows.push({ row, accountId, assetId });
  }
  if (!uniqueRows.length) return { batchId: null, imported: 0, skippedDuplicates };

  const batchId = id("import");
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (hasDemo) statements.push(...clearDemoStatements(database, ownerId));
  statements.push(
    database.prepare(
      "INSERT INTO import_batches (id,owner_id,source,filename,status,row_count,confirmed_at,is_demo,created_at) VALUES (?,?,?,?,?,?,?,0,?)",
    ).bind(batchId, ownerId, "CSV upload", filename.slice(0, 180), "CONFIRMED", uniqueRows.length, now, now),
  );
  for (const { row, accountId, assetId } of uniqueRows) {
    statements.push(
      database.prepare(
        `INSERT INTO accounts (id,owner_id,name,institution,base_currency,masked_account,is_demo,created_at)
         VALUES (?,?,?,?,?,?,0,?) ON CONFLICT(id) DO UPDATE SET
         name=excluded.name,institution=excluded.institution,masked_account=excluded.masked_account`,
      ).bind(accountId, ownerId, row.accountName, row.institution, row.currency, row.maskedAccount, now),
    );
    if (assetId) {
      statements.push(
        database.prepare(
          `INSERT INTO assets
           (id,symbol,name,asset_type,currency,sector,provider_symbol,is_leveraged,leverage_target,is_demo,created_at)
           VALUES (?,?,?,?,?,NULL,?,?,?,0,?) ON CONFLICT(symbol,currency) DO UPDATE SET
           name=excluded.name,asset_type=excluded.asset_type,provider_symbol=excluded.provider_symbol,
           is_leveraged=excluded.is_leveraged,leverage_target=excluded.leverage_target`,
        ).bind(
          assetId, row.symbol, row.assetName, row.assetType, row.currency, row.symbol,
          row.symbol === "TQQQ" ? 1 : 0, row.symbol === "TQQQ" ? 3 : null, now,
        ),
      );
    }
    statements.push(
      database.prepare(
        `INSERT INTO transactions
         (id,owner_id,account_id,asset_id,type,traded_at,settlement_date,quantity,unit_price,currency,fee,tax,
          fx_to_base,total_amount,source,import_batch_id,note,reconciled,is_demo,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      ).bind(
        id("tx"), ownerId, accountId, assetId, row.type, row.tradedAt, row.settlementDate,
        row.quantity, row.unitPrice, row.currency, row.fee, row.tax, row.fxToUsd,
        row.totalAmount, row.source, batchId, row.note, row.reconciled ? 1 : 0, now, now,
      ),
    );
  }
  await database.batch(statements);
  return { batchId, imported: uniqueRows.length, skippedDuplicates };
}

export async function exportTransactionsCsv(ownerId: string) {
  await ensureDatabase();
  const rows = await all(
    getDatabase(),
    `SELECT ac.name account_name, ac.institution, ac.masked_account,
      a.symbol, a.name asset_name, a.asset_type, t.type transaction_type,
      t.traded_at, t.settlement_date, t.quantity, t.unit_price, t.currency,
      t.fee, t.tax, t.fx_to_base fx_to_usd, t.total_amount, t.source, t.note,
      t.reconciled
     FROM transactions t JOIN accounts ac ON ac.id=t.account_id
     LEFT JOIN assets a ON a.id=t.asset_id WHERE t.owner_id=? ORDER BY t.traded_at,t.id`,
    [ownerId],
  );
  return stringifyCsv(rows, csvHeaders);
}

const backupColumns = {
  accounts: ["id", "owner_id", "name", "institution", "base_currency", "masked_account", "is_demo", "created_at"],
  assets: ["id", "symbol", "name", "asset_type", "currency", "sector", "provider_symbol", "is_leveraged", "leverage_target", "is_demo", "created_at"],
  import_batches: ["id", "owner_id", "source", "filename", "status", "row_count", "confirmed_at", "is_demo", "created_at"],
  transactions: ["id", "owner_id", "account_id", "asset_id", "type", "traded_at", "settlement_date", "quantity", "unit_price", "currency", "fee", "tax", "fx_to_base", "total_amount", "source", "import_batch_id", "note", "reconciled", "is_demo", "created_at", "updated_at"],
  cash_flows: ["id", "account_id", "transaction_id", "type", "occurred_at", "amount", "currency", "fx_to_base", "external", "created_at"],
  positions: ["id", "account_id", "asset_id", "cost_method", "quantity", "cost_base", "as_of"],
  price_snapshots: ["id", "owner_id", "asset_id", "price_date", "fetched_at", "provider", "quoted_at", "session", "data_quality", "is_delayed", "price", "nav", "currency", "status", "is_demo"],
  portfolio_snapshots: ["id", "owner_id", "snapshot_date", "base_currency", "total_value", "net_contributions", "realized_pnl", "unrealized_pnl", "dividend_income", "fee_and_tax", "fx_pnl", "status", "session", "created_at", "is_demo"],
  theses: ["id", "owner_id", "asset_id", "decision_type", "opened_at", "horizon", "max_loss", "planned_weight", "confidence", "status", "created_at"],
  thesis_revisions: ["id", "thesis_id", "revised_at", "buy_reason", "mispricing", "catalysts", "risks", "invalidation", "sources", "status", "note"],
  decision_reviews: ["id", "thesis_id", "due_at", "horizon_days", "expectation", "actual", "thesis_assessment", "timing_assessment", "sizing_assessment", "bias", "relative_qqq", "relative_spy", "process_grade", "confirmed", "completed_at"],
} as const;

type Backup = {
  schemaVersion: 3;
  exportedAt: string;
  tables: Record<keyof typeof backupColumns, Array<Record<string, unknown>>>;
};

export async function createBackup(ownerId: string): Promise<Backup> {
  await ensureDatabase();
  const database = getDatabase();
  const tables = {} as Backup["tables"];
  tables.accounts = await all(database, "SELECT * FROM accounts WHERE owner_id=?", [ownerId]);
  tables.assets = await all(database, `SELECT DISTINCT a.* FROM assets a JOIN transactions t ON t.asset_id=a.id WHERE t.owner_id=?`, [ownerId]);
  tables.import_batches = await all(database, "SELECT * FROM import_batches WHERE owner_id=?", [ownerId]);
  tables.transactions = await all(database, "SELECT * FROM transactions WHERE owner_id=?", [ownerId]);
  tables.cash_flows = await all(database, "SELECT * FROM cash_flows WHERE account_id IN (SELECT id FROM accounts WHERE owner_id=?)", [ownerId]);
  tables.positions = await all(database, "SELECT * FROM positions WHERE account_id IN (SELECT id FROM accounts WHERE owner_id=?)", [ownerId]);
  tables.price_snapshots = await all(database, "SELECT * FROM price_snapshots WHERE owner_id=?", [ownerId]);
  tables.portfolio_snapshots = await all(database, "SELECT * FROM portfolio_snapshots WHERE owner_id=?", [ownerId]);
  tables.theses = await all(database, "SELECT * FROM theses WHERE owner_id=?", [ownerId]);
  tables.thesis_revisions = await all(database, "SELECT r.* FROM thesis_revisions r JOIN theses t ON t.id=r.thesis_id WHERE t.owner_id=?", [ownerId]);
  tables.decision_reviews = await all(database, "SELECT r.* FROM decision_reviews r JOIN theses t ON t.id=r.thesis_id WHERE t.owner_id=?", [ownerId]);
  return { schemaVersion: 3, exportedAt: new Date().toISOString(), tables };
}

export async function restoreBackup(ownerId: string, value: unknown) {
  const backup = value as Partial<Backup>;
  if (Number(backup.schemaVersion) !== 3 || !backup.tables || typeof backup.tables !== "object") {
    throw new Error("This Beta can restore only Alpha Lab Beta backups. Use CSV to migrate an older ledger.");
  }
  await ensureDatabase();
  const database = getDatabase();
  const rows = Object.entries(backup.tables).reduce(
    (count, [table, items]) => count + (table in backupColumns && Array.isArray(items) ? items.length : 0),
    0,
  );
  if (rows > 5_000) throw new Error("Backup is larger than the V1 restore limit of 5,000 records");
  const statements: D1PreparedStatement[] = [
    database.prepare("DELETE FROM decision_reviews WHERE thesis_id IN (SELECT id FROM theses WHERE owner_id=?)").bind(ownerId),
    database.prepare("DELETE FROM thesis_revisions WHERE thesis_id IN (SELECT id FROM theses WHERE owner_id=?)").bind(ownerId),
    database.prepare("DELETE FROM theses WHERE owner_id=?").bind(ownerId),
    database.prepare("DELETE FROM positions WHERE account_id IN (SELECT id FROM accounts WHERE owner_id=?)").bind(ownerId),
    database.prepare("DELETE FROM cash_flows WHERE account_id IN (SELECT id FROM accounts WHERE owner_id=?)").bind(ownerId),
    database.prepare("DELETE FROM transactions WHERE owner_id=?").bind(ownerId),
    database.prepare("DELETE FROM price_snapshots WHERE owner_id=?").bind(ownerId),
    database.prepare("DELETE FROM portfolio_snapshots WHERE owner_id=?").bind(ownerId),
    database.prepare("DELETE FROM import_batches WHERE owner_id=?").bind(ownerId),
    database.prepare("DELETE FROM accounts WHERE owner_id=?").bind(ownerId),
  ];
  for (const table of Object.keys(backupColumns) as Array<keyof typeof backupColumns>) {
    const items = backup.tables[table];
    if (!Array.isArray(items)) throw new Error(`Backup table ${table} is invalid`);
    const columns = backupColumns[table];
    const placeholders = columns.map(() => "?").join(",");
    for (const item of items) {
      if (!item || typeof item !== "object") throw new Error(`Backup table ${table} contains an invalid row`);
      const values = columns.map((column) => column === "owner_id" ? ownerId : item[column]);
      const sql = table === "assets"
        ? `INSERT INTO assets (${columns.join(",")}) VALUES (${placeholders}) ON CONFLICT(symbol,currency) DO NOTHING`
        : `INSERT INTO ${table} (${columns.join(",")}) VALUES (${placeholders})`;
      statements.push(database.prepare(sql).bind(...values));
    }
  }
  await database.batch(statements);
  return { restored: rows };
}

export async function deleteImportBatch(ownerId: string, batchId: string) {
  await ensureDatabase();
  const database = getDatabase();
  await database.batch([
    database.prepare("DELETE FROM transactions WHERE import_batch_id=? AND owner_id=?").bind(batchId, ownerId),
    database.prepare("DELETE FROM import_batches WHERE id=? AND owner_id=?").bind(batchId, ownerId),
  ]);
}

function normalizeCsvRow(row: Record<string, string>, index: number) {
  const type = row.transaction_type.toUpperCase() as TransactionType;
  const assetType = row.asset_type.toUpperCase() as AssetType;
  const currency = row.currency.toUpperCase() as Currency;
  if (!transactionTypes.has(type)) throw new Error(`Row ${index + 2}: invalid transaction_type`);
  if (!assetTypes.has(assetType)) throw new Error(`Row ${index + 2}: invalid asset_type`);
  if (!currencies.has(currency)) throw new Error(`Row ${index + 2}: invalid currency`);
  if (!row.account_name || !row.institution || !row.traded_at) {
    throw new Error(`Row ${index + 2}: account_name, institution and traded_at are required`);
  }
  const assetRequired = !["CASH_IN", "CASH_OUT", "FEE", "DIVIDEND_TAX"].includes(type);
  if (assetRequired && (!row.symbol || !row.asset_name)) {
    throw new Error(`Row ${index + 2}: symbol and asset_name are required`);
  }
  const fxToUsd = optionalNumber(row.fx_to_usd, index, "fx_to_usd") ?? (currency === "USD" ? 1 : null);
  if (currency !== "USD" && (!fxToUsd || fxToUsd <= 0)) {
    throw new Error(`Row ${index + 2}: non-USD rows require fx_to_usd`);
  }
  return {
    accountName: row.account_name.slice(0, 80), institution: row.institution.slice(0, 80),
    maskedAccount: maskAccount(row.masked_account), symbol: row.symbol.toUpperCase().slice(0, 32),
    assetName: row.asset_name.slice(0, 120), assetType, type, tradedAt: row.traded_at,
    settlementDate: row.settlement_date || null, quantity: optionalNumber(row.quantity, index, "quantity") ?? 0,
    unitPrice: optionalNumber(row.unit_price, index, "unit_price"), currency,
    fee: optionalNumber(row.fee, index, "fee") ?? 0, tax: optionalNumber(row.tax, index, "tax") ?? 0,
    fxToUsd, totalAmount: optionalNumber(row.total_amount, index, "total_amount"),
    source: (row.source || "CSV upload").slice(0, 120), note: row.note.slice(0, 500) || null,
    reconciled: /^(1|true|yes)$/i.test(row.reconciled),
  };
}

function optionalNumber(value: string, index: number, field: string) {
  if (!value) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`Row ${index + 2}: ${field} is invalid`);
  return number;
}

function maskAccount(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? `•••• ${digits.slice(-4)}` : null;
}

function stableId(prefix: string, value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  return `${prefix}-${slug || "record"}`;
}

function clearDemoStatements(database: D1Database, ownerId: string) {
  return [
    database.prepare("DELETE FROM decision_reviews WHERE thesis_id IN (SELECT id FROM theses WHERE owner_id=?)").bind(ownerId),
    database.prepare("DELETE FROM thesis_revisions WHERE thesis_id IN (SELECT id FROM theses WHERE owner_id=?)").bind(ownerId),
    database.prepare("DELETE FROM theses WHERE owner_id=?").bind(ownerId),
    database.prepare("DELETE FROM positions WHERE account_id IN (SELECT id FROM accounts WHERE owner_id=? AND is_demo=1)").bind(ownerId),
    database.prepare("DELETE FROM cash_flows WHERE account_id IN (SELECT id FROM accounts WHERE owner_id=? AND is_demo=1)").bind(ownerId),
    database.prepare("DELETE FROM transactions WHERE owner_id=? AND is_demo=1").bind(ownerId),
    database.prepare("DELETE FROM price_snapshots WHERE owner_id=? AND is_demo=1").bind(ownerId),
    database.prepare("DELETE FROM portfolio_snapshots WHERE owner_id=? AND is_demo=1").bind(ownerId),
    database.prepare("DELETE FROM import_batches WHERE owner_id=? AND is_demo=1").bind(ownerId),
    database.prepare("DELETE FROM accounts WHERE owner_id=? AND is_demo=1").bind(ownerId),
  ];
}

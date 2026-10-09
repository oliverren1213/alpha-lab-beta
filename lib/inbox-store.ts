import { all, ensureDatabase, getDatabase, id, mapTransaction, validateTransactionInput } from "./database";
import { matchInboxTrade, type InboxDocument, type InboxTrade } from "./inbox";
import { calculatePortfolio } from "./portfolio";
import type { Account, Asset } from "./types";
import { feeStatus, withFeeStatus, type FeeStatus } from "./fee-status";

type Row = Record<string, unknown>;
type SavedDocument = InboxDocument & { before?: Row[]; after?: Row[] };
const columns = ["id","owner_id","account_id","asset_id","type","traded_at","settlement_date","quantity","unit_price","currency","fee","tax","fx_to_base","total_amount","source","import_batch_id","note","reconciled","is_demo","created_at","updated_at"];
const key = (ownerId: string, docId: string) => `inbox:${ownerId}:${docId}`;
const inventoryGuard = `(SELECT COUNT(*) FROM transactions WHERE owner_id=?)=json_array_length(?) AND NOT EXISTS (
  SELECT 1 FROM json_each(?) AS recorded WHERE NOT EXISTS (
    SELECT 1 FROM transactions AS t WHERE ${columns.map((column) => `t.${column} IS json_extract(recorded.value,'$.${column}')`).join(" AND ")}
  ))`;

export async function readInbox(ownerId: string) {
  await ensureDatabase();
  const rows = await all(getDatabase(), "SELECT value FROM settings WHERE substr(key,1,length(?))=? ORDER BY updated_at DESC LIMIT 40", [`inbox:${ownerId}:`,`inbox:${ownerId}:`]);
  return rows.map((row) => {
    const doc = JSON.parse(String(row.value)) as SavedDocument;
    return { id: doc.id, filename: doc.filename, createdAt: doc.createdAt, status: doc.status, rawText: doc.rawText, trades: doc.trades };
  });
}

export async function saveInboxDocument(ownerId: string, body: unknown, docId?: string) {
  if (!body || typeof body !== "object") throw new Error("文件内容无效");
  const input = body as Record<string, unknown>;
  if (typeof input.filename !== "string" || typeof input.rawText !== "string" || input.rawText.length > 100000 || !Array.isArray(input.trades) || input.trades.length > 50) throw new Error("每份最多 50 笔，原文最多 100000 字");
  // Drafts retain unreadable fields as null; financial validation happens on confirmation.
  const trades = input.trades.map((item) => sanitizeDraft(item));
  const doc: SavedDocument = { id: id("document"), filename: input.filename.slice(0,180), rawText: input.rawText, trades, status: "DRAFT", createdAt: new Date().toISOString() };
  await ensureDatabase();
  if (docId) {
    const result = await getDatabase().prepare("UPDATE settings SET value=json_set(value,'$.trades',json(?)),updated_at=? WHERE key=? AND json_extract(value,'$.status')='DRAFT'").bind(JSON.stringify(trades), doc.createdAt, key(ownerId, docId)).run();
    if (!result.meta.changes) throw new Error("候选已入账或不存在，请刷新");
    return { ...doc, id: docId };
  }
  await getDatabase().prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)").bind(key(ownerId, doc.id), JSON.stringify(doc), doc.createdAt).run();
  return doc;
}

export async function applyInbox(ownerId: string, docId: string, selections: unknown) {
  await ensureDatabase();
  const db = getDatabase();
  const stored = await db.prepare("SELECT value FROM settings WHERE key=?").bind(key(ownerId, docId)).first<{ value: string }>();
  if (!stored) throw new Error("找不到这份文件");
  const doc = JSON.parse(stored.value) as SavedDocument;
  if (doc.status === "APPLIED") return { alreadyApplied: true, changed: doc.after?.length ?? 0 };
  if (doc.status !== "DRAFT" || !Array.isArray(selections) || !selections.length || selections.length > 50) throw new Error("请选择待确认交易");
  const rows = await all(db, "SELECT * FROM transactions WHERE owner_id=? ORDER BY id", [ownerId]);
  const ledger = rows.map(mapTransaction);
  const accounts = await all(db, "SELECT * FROM accounts WHERE owner_id=?", [ownerId]);
  const assets = await all(db, "SELECT DISTINCT a.* FROM assets a JOIN transactions t ON t.asset_id=a.id WHERE t.owner_id=?", [ownerId]);
  const now = new Date().toISOString();
  const before: Row[] = []; const after: Row[] = []; const claimed = new Set<string>();
  const reviewedTrades = [...doc.trades];
  for (const value of selections) {
    const selection = value as { index: number; trade: unknown; replace?: boolean };
    if (!Number.isInteger(selection.index) || !doc.trades[selection.index]) throw new Error("候选编号无效");
    const trade = sanitizeDraft(selection.trade);
    reviewedTrades[selection.index] = trade;
    if (!["BUY","SELL","SUBSCRIPTION","REDEMPTION","DIVIDEND"].includes(trade.type)) throw new Error("收件箱只支持成交与股息记录");
    validateTransactionInput({ ...trade, fee: trade.fee ?? undefined, tax: trade.tax ?? undefined });
    if (!accounts.some((account) => account.id === trade.accountId) || !assets.some((asset) => asset.id === trade.assetId && asset.currency === trade.currency)) throw new Error("请选择已有的真实账户与匹配币种的标的");
    const match = matchInboxTrade(trade, ledger);
    if (match.status === "EXISTS") continue;
    if (match.status === "INCOMPLETE" || (match.status === "CONFLICT" && (!selection.replace || !match.existingId))) throw new Error("请补齐字段，存在差异的交易需要明确选择替换");
    const old = match.existingId ? rows.find((row) => row.id === match.existingId) : null;
    if (match.existingId && !old) throw new Error("同一批次有重复或互相冲突的候选，请只保留一项");
    const identity = match.existingId ?? [trade.accountId,trade.assetId,trade.type,trade.tradedAt,trade.quantity,trade.unitPrice,trade.totalAmount].join("|");
    if (claimed.has(identity)) throw new Error("同一批次重复引用了相同交易，请保留一项");
    claimed.add(identity);
    if (old) before.push(old);
    const provenance = `Document ${doc.id}${trade.reference ? `; reference ${trade.reference}` : ""}`;
    const preserveFinalFees = trade.feeStatus === "PROVISIONAL" && old && feeStatus(mapTransaction(old)) !== "PROVISIONAL";
    const finalFeeStatus = preserveFinalFees ? feeStatus(mapTransaction(old)) : trade.feeStatus;
    const row: Row = {
      id: old?.id ?? id("tx"), owner_id: ownerId, account_id: trade.accountId, asset_id: trade.assetId, type: trade.type,
      traded_at: old && String(old.traded_at).slice(0,10) === trade.tradedAt ? old.traded_at : trade.tradedAt,
      settlement_date: trade.settlementDate ?? old?.settlement_date ?? null,
      quantity: trade.quantity, unit_price: trade.unitPrice, currency: trade.currency,
      fee: preserveFinalFees ? old.fee : trade.fee, tax: preserveFinalFees ? old.tax : trade.tax, fx_to_base: trade.currency === "USD" ? 1 : trade.fxToBase,
      total_amount: trade.totalAmount ?? old?.total_amount ?? null, source: trade.source,
      import_batch_id: old?.import_batch_id ?? null, note: finalFeeStatus ? withFeeStatus([old?.note, provenance].filter(Boolean).join("\n").slice(0,7900), finalFeeStatus) : [old?.note, provenance].filter(Boolean).join("\n").slice(0,8000),
      reconciled: 1, is_demo: accounts.find(account => account.id === trade.accountId)?.is_demo ? 1 : 0, created_at: old?.created_at ?? now, updated_at: now,
    };
    after.push(row);
    const oldIndex = ledger.findIndex((tx) => tx.id === row.id);
    if (oldIndex >= 0) ledger[oldIndex] = mapTransaction(row);
    else ledger.push(mapTransaction(row));
  }
  // Validate the full projected inventory BEFORE any financial writes.
  calculatePortfolio({ accounts: accounts.map((row) => ({ id: String(row.id), name: String(row.name) }) as Account),
    assets: assets.map((row) => ({ id: String(row.id), currency: row.currency }) as Asset),
    transactions: ledger, prices: [], fxRates: [], costMethod: "WEIGHTED_AVERAGE" });
  const guards = ["EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)"];
  const args: unknown[] = [key(ownerId, doc.id),stored.value];
  // Guard the complete inventory, not just touched rows: a parallel sale must
  // not invalidate the projected quantities between validation and commit.
  // Two JSON parameters avoid D1's per-query bind-variable ceiling for large ledgers.
  guards.push(inventoryGuard);
  args.push(ownerId,JSON.stringify(rows),JSON.stringify(rows));
  const audit: SavedDocument = { ...doc, trades: reviewedTrades, status: "APPLIED", before, after };
  const statements = [db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,CASE WHEN ${guards.join(" AND ")} THEN ? ELSE NULL END,?)`).bind(`inbox-apply:${ownerId}:${doc.id}`, ...args, "confirmed", now)];
  for (const row of after) statements.push(db.prepare(`INSERT INTO transactions(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${columns.filter((column) => !["id","created_at"].includes(column)).map((column) => `${column}=excluded.${column}`).join(",")}`).bind(...columns.map((column) => row[column])));
  statements.push(db.prepare("UPDATE settings SET value=?,updated_at=? WHERE key=?").bind(JSON.stringify(audit),now,key(ownerId, doc.id)));
  // D1 batch is transactional. The NOT NULL guard aborts everything on stale data.
  try { await db.batch(statements); } catch { throw new Error("账本或文件刚刚发生变化，本次未写入。请刷新后重新核对"); }
  return { changed: after.length, skipped: selections.length - after.length };
}

export async function undoInbox(ownerId: string, docId: string) {
  await ensureDatabase(); const db = getDatabase();
  const stored = await db.prepare("SELECT value FROM settings WHERE key=?").bind(key(ownerId, docId)).first<{ value: string }>();
  if (!stored) throw new Error("文件不存在");
  const doc = JSON.parse(stored.value) as SavedDocument;
  if (doc.status === "UNDONE") return { undone: true };
  if (doc.status !== "APPLIED" || !doc.after || !doc.before) throw new Error("此文件还未入账");
  const currentRows = await all(db, "SELECT * FROM transactions WHERE owner_id=? ORDER BY id", [ownerId]);
  const projected = currentRows.filter((row) => !doc.after!.some((item) => item.id === row.id)).concat(doc.before);
  const accountRows = await all(db, "SELECT id,name FROM accounts WHERE owner_id=?", [ownerId]);
  const assetRows = await all(db, "SELECT DISTINCT a.id,a.currency FROM assets a JOIN transactions t ON t.asset_id=a.id WHERE t.owner_id=?", [ownerId]);
  calculatePortfolio({ accounts: accountRows.map((row) => ({ id: String(row.id), name: String(row.name) }) as Account),
    assets: assetRows.map((row) => ({ id: String(row.id), currency: row.currency }) as Asset),
    transactions: projected.map(mapTransaction), prices: [], fxRates: [], costMethod: "WEIGHTED_AVERAGE" });
  const guards = ["EXISTS(SELECT 1 FROM settings WHERE key=? AND value=?)"]; const args: unknown[] = [key(ownerId, doc.id),stored.value];
  for (const row of doc.after) {
    const current = currentRows.find((item) => item.id === row.id);
    if (!current || current.updated_at !== row.updated_at) throw new Error("相关交易在入账后被修改，撤销已停止，请在账本中核对");
  }
  guards.push(inventoryGuard);
  args.push(ownerId,JSON.stringify(currentRows),JSON.stringify(currentRows));
  const statements = [db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,CASE WHEN ${guards.join(" AND ")} THEN ? ELSE NULL END,?)`).bind(`inbox-undo:${ownerId}:${doc.id}`,...args,"undone",new Date().toISOString())];
  for (const row of doc.after) if (!doc.before.some((old) => old.id === row.id)) statements.push(db.prepare("DELETE FROM transactions WHERE id=? AND owner_id=?").bind(row.id,ownerId));
  for (const row of doc.before) statements.push(db.prepare(`UPDATE transactions SET ${columns.filter((column) => column !== "id").map((column) => `${column}=?`).join(",")} WHERE id=? AND owner_id=?`).bind(...columns.filter((column) => column !== "id").map((column) => row[column]),row.id,ownerId));
  statements.push(db.prepare("UPDATE settings SET value=?,updated_at=? WHERE key=?").bind(JSON.stringify({ ...doc, status: "UNDONE" }),new Date().toISOString(),key(ownerId, doc.id)));
  try { await db.batch(statements); } catch { throw new Error("相关交易在入账后被修改，撤销已停止，请在账本中核对"); }
  return { undone: true };
}

function sanitizeDraft(value: unknown): InboxTrade {
  if (!value || typeof value !== "object") throw new Error("候选格式无效");
  const input = value as Record<string, unknown>;
  const text = (field: string, limit = 180) => typeof input[field] === "string" ? String(input[field]).slice(0,limit) : "";
  const number = (field: string) => input[field] == null ? null : typeof input[field] === "number" && Number.isFinite(input[field]) && Number(input[field]) >= 0 ? Number(input[field]) : (() => { throw new Error("数字无效"); })();
  const status = input.feeStatus;
  if (status != null && !["PROVISIONAL","CONFIRMED","STATEMENT"].includes(String(status))) throw new Error("费用核对状态无效");
  return { accountId: text("accountId"), assetId: text("assetId") || null, type: text("type") as InboxTrade["type"], tradedAt: text("tradedAt",10), settlementDate: text("settlementDate",10) || null, quantity: number("quantity") ?? 0, unitPrice: number("unitPrice"), currency: text("currency",3) as InboxTrade["currency"], fee: number("fee"), tax: number("tax"), feeStatus: status as FeeStatus | undefined, fxToBase: number("fxToBase"), totalAmount: number("totalAmount"), reference: text("reference"), evidence: text("evidence",6000), source: text("source") || "Confirmed document" };
}

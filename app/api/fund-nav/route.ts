import { NextResponse } from "next/server";
import { assertSameOrigin, requireSession } from "../../../lib/auth";
import { ensureDatabase, getDatabase, id } from "../../../lib/database";
import { persistPortfolioSnapshot } from "../../../lib/pipeline";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSession();
    const body = (await request.json()) as Record<string, unknown>;
    const assetId = typeof body.assetId === "string" ? body.assetId : "";
    const nav = Number(body.nav);
    const navDate = typeof body.navDate === "string" ? body.navDate : "";
    if (!assetId || !Number.isFinite(nav) || nav <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(navDate)) {
      throw new Error("基金、有效净值和净值日期为必填项");
    }
    if (navDate > new Date().toISOString().slice(0, 10)) {
      throw new Error("净值日期不能晚于今天");
    }
    await ensureDatabase();
    const database = getDatabase();
    const asset = await database.prepare(
      `SELECT a.id,a.currency FROM assets a
       WHERE a.id=? AND a.asset_type='FUND' AND a.is_demo=0
         AND EXISTS (SELECT 1 FROM transactions t WHERE t.asset_id=a.id AND t.owner_id=?)`,
    ).bind(assetId, user.id).first<{ id: string; currency: string }>();
    if (!asset) throw new Error("找不到已确认的基金资产");
    const fetchedAt = new Date().toISOString();
    await database.prepare(
      `INSERT INTO price_snapshots
       (id,owner_id,asset_id,price_date,fetched_at,provider,quoted_at,session,data_quality,is_delayed,
        price,nav,currency,status,is_demo)
       VALUES (?,?,?,?,?,?,NULL,'NAV','NAV',0,NULL,?,?, 'FRESH',0)
       ON CONFLICT(owner_id,asset_id,price_date,provider,session) DO UPDATE SET
        nav=excluded.nav,fetched_at=excluded.fetched_at,status='FRESH'`,
    ).bind(id("nav"), user.id, asset.id, navDate, fetchedAt, "Confirmed manual NAV", nav, asset.currency).run();
    await database.prepare(
      "UPDATE data_sources SET last_success_at=?,last_error=NULL WHERE id='source-funds'",
    ).bind(fetchedAt).run();
    const snapshotUpdated = await persistPortfolioSnapshot("NAV", "FRESH", user.id);
    return NextResponse.json({ ok: true, snapshotUpdated }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "无法保存基金净值" },
      { status: 400 },
    );
  }
}

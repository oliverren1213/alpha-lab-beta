import { NextResponse } from "next/server";
import { assertSameOrigin, requireSession } from "../../../lib/auth";
import { ensureDatabase, getDatabase, id } from "../../../lib/database";

const decisionTypes = new Set(["INVESTMENT", "TRADE", "TASK", "WATCH"]);
const statuses = new Set(["STRENGTHENED", "UNCHANGED", "WEAKENED", "INVALIDATED", "CLOSED"]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSession();
    const body = (await request.json()) as Record<string, unknown>;
    const assetId = text(body.assetId, 100);
    const decisionType = text(body.decisionType, 24).toUpperCase();
    const openedAt = text(body.openedAt, 10);
    const horizon = text(body.horizon, 120);
    const buyReason = text(body.buyReason, 4_000);
    const risks = text(body.risks, 4_000);
    const invalidation = text(body.invalidation, 4_000);
    const status = text(body.status, 24).toUpperCase();
    const confidence = Number(body.confidence);
    if (!assetId || !/^\d{4}-\d{2}-\d{2}$/.test(openedAt) || !horizon || !buyReason || !risks || !invalidation) {
      throw new Error("请填写标的、日期、期限、理由、风险和失效条件");
    }
    if (!decisionTypes.has(decisionType) || !statuses.has(status)) throw new Error("决策类型或状态无效");
    if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5) {
      throw new Error("信心等级必须为 1 到 5");
    }
    await ensureDatabase();
    const database = getDatabase();
    const asset = await database.prepare(
      `SELECT a.id FROM assets a WHERE a.id=? AND a.is_demo=0
       AND EXISTS (SELECT 1 FROM transactions t WHERE t.asset_id=a.id AND t.owner_id=?)`,
    ).bind(assetId, user.id).first<{ id: string }>();
    if (!asset) throw new Error("找不到已确认的资产");
    const thesisId = id("thesis");
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      database.prepare(
        `INSERT INTO theses
         (id,owner_id,asset_id,decision_type,opened_at,horizon,max_loss,planned_weight,confidence,status,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        thesisId, user.id, assetId, decisionType, openedAt, horizon,
        optionalNumber(body.maxLoss), optionalNumber(body.plannedWeight), confidence, status, now,
      ),
      database.prepare(
        `INSERT INTO thesis_revisions
         (id,thesis_id,revised_at,buy_reason,mispricing,catalysts,risks,invalidation,sources,status,note)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        id("revision"), thesisId, now, buyReason, optionalText(body.mispricing),
        optionalText(body.catalysts), risks, invalidation, optionalText(body.sources),
        status, optionalText(body.note),
      ),
    ];
    for (const days of [7, 30, 90]) {
      const due = new Date(`${openedAt}T12:00:00Z`);
      due.setUTCDate(due.getUTCDate() + days);
      statements.push(
        database.prepare(
          `INSERT INTO decision_reviews
           (id,thesis_id,due_at,horizon_days,expectation,confirmed)
           VALUES (?,?,?,?,?,0)`,
        ).bind(id("review"), thesisId, due.toISOString().slice(0, 10), days, buyReason.slice(0, 1_000)),
      );
    }
    await database.batch(statements);
    return NextResponse.json({ id: thesisId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "无法保存投资逻辑" },
      { status: 400 },
    );
  }
}

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function optionalText(value: unknown) {
  const valueText = text(value, 4_000);
  return valueText || null;
}

function optionalNumber(value: unknown) {
  if (value === "" || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error("仓位或亏损上限无效");
  return number;
}

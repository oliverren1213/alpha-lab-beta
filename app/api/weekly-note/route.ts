import { NextResponse } from "next/server";
import { assertSameOrigin, requireSession } from "../../../lib/auth";
import { execute } from "../../../lib/database";

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSession();
    const body = await request.json() as { week?: unknown; text?: unknown; expectedUpdatedAt?: unknown };
    if (typeof body.week !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.week) || new Date(body.week + "T12:00:00Z").toISOString().slice(0, 10) !== body.week) throw new Error("周次日期无效");
    if (new Date(body.week + "T12:00:00Z").getUTCDay() !== 1) throw new Error("周次必须从周一开始");
    if (typeof body.text !== "string" || body.text.length > 12000) throw new Error("备忘最多 12000 字");
    if (body.expectedUpdatedAt != null && typeof body.expectedUpdatedAt !== "string") throw new Error("保存版本无效");
    const result = await execute("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE settings.updated_at=?", [`weekly-note:${user.id}:${body.week}`, body.text, new Date().toISOString(), body.expectedUpdatedAt ?? null]);
    if (!result.meta.changes) return NextResponse.json({ error: "备忘在其他页面更新过，请刷新核对。你的输入仍保留。" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法保存备忘" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { assertSameOrigin, requireSession } from "../../../../lib/auth";
import { execute } from "../../../../lib/database";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireSession();
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const actual = typeof body.actual === "string" ? body.actual.trim() : "";
    const lesson = typeof body.lesson === "string" ? body.lesson.trim() : "";
    if (!actual || actual.length > 4000 || lesson.length > 4000) throw new Error("请填写复盘事实，最多 4000 字");
    if (!["SUPPORTED", "UNCLEAR", "WEAKENED", "INVALIDATED"].includes(String(body.assessment))) throw new Error("请选择判断结果");
    if (!["APPROPRIATE", "TOO_LARGE", "TOO_SMALL", "UNCLEAR"].includes(String(body.sizing))) throw new Error("请选择仓位评价");
    const result = await execute("UPDATE decision_reviews SET actual=?,thesis_assessment=?,sizing_assessment=?,bias=?,confirmed=1,completed_at=? WHERE id=? AND completed_at IS NULL AND thesis_id IN (SELECT id FROM theses WHERE owner_id=?)", [actual, body.assessment, body.sizing, lesson, new Date().toISOString(), id, user.id]);
    if (!result.meta.changes) return NextResponse.json({ error: "这次复盘已保存或不存在，请刷新查看" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法保存复盘" }, { status: 400 });
  }
}

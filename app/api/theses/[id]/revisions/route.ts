import { NextResponse } from "next/server";
import { assertSameOrigin, requireSession } from "../../../../../lib/auth";
import { ensureDatabase, execute, getDatabase, id } from "../../../../../lib/database";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const user = await requireSession();
    const { id: thesisId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    await ensureDatabase();
    const owned = await getDatabase().prepare("SELECT id FROM theses WHERE id=? AND owner_id=?")
      .bind(thesisId, user.id).first<{ id: string }>();
    if (!owned) throw new Error("Investment thesis does not exist");
    for (const field of ["buyReason", "risks", "invalidation", "status"]) {
      if (typeof body[field] !== "string" || !String(body[field]).trim()) {
        throw new Error(`${field} is required`);
      }
    }
    await execute(
      `INSERT INTO thesis_revisions
       (id,thesis_id,revised_at,buy_reason,mispricing,catalysts,risks,invalidation,sources,status,note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id("revision"), thesisId, new Date().toISOString(), String(body.buyReason).slice(0, 4000),
        stringOrNull(body.mispricing), stringOrNull(body.catalysts), String(body.risks).slice(0, 4000),
        String(body.invalidation).slice(0, 4000), stringOrNull(body.sources),
        String(body.status).slice(0, 40), stringOrNull(body.note),
      ],
    );
    await execute("UPDATE theses SET status=? WHERE id=? AND owner_id=?", [String(body.status), thesisId, user.id]);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to append revision" },
      { status: 400 },
    );
  }
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 4000) : null;
}

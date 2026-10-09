import { NextResponse } from "next/server";
import { assertSameOrigin, requireSession } from "../../../lib/auth";
import { applyInbox, readInbox, saveInboxDocument, undoInbox } from "../../../lib/inbox-store";

export async function GET() {
  try { const user = await requireSession(); return NextResponse.json(await readInbox(user.id), { headers: { "cache-control": "no-store" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "收件箱读取失败" }, { status: 400 }); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireSession();
    if (Number(request.headers.get("content-length")) > 500000) throw new Error("文件识别结果过大");
    const raw = await request.text();
    if (raw.length > 500000) throw new Error("文件识别结果过大");
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.action === "apply" && body.confirm === true && typeof body.id === "string") return NextResponse.json(await applyInbox(user.id, body.id,body.selections));
    if (body.action === "undo" && body.confirm === true && typeof body.id === "string") return NextResponse.json(await undoInbox(user.id, body.id));
    if (body.action === "save") return NextResponse.json(await saveInboxDocument(user.id, body.document), { status: 201 });
    if (body.action === "draft" && typeof body.id === "string") return NextResponse.json(await saveInboxDocument(user.id, body.document,body.id));
    throw new Error("操作无效，请确认后重试");
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "收件箱保存失败" }, { status: 400 }); }
}

import { NextResponse } from "next/server";
import { assertSameOrigin, AuthError, requireSession } from "../../../lib/auth";
import { readDailyBrief, refreshDailyBrief } from "../../../lib/daily-brief-store";

const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  try { const user = await requireSession(); return NextResponse.json(await readDailyBrief(), { headers }); }
  catch (error) { return NextResponse.json({ error: error instanceof AuthError ? error.message : "Daily brief unavailable" }, { status: error instanceof AuthError ? 401 : 503, headers }); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireSession();
    const body = await request.json().catch(() => ({})) as {trigger?:string} | null;
    return NextResponse.json(await refreshDailyBrief(body?.trigger === "MANUAL" ? "MANUAL" : "STALE_OPEN"), { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof AuthError ? error.message : "Refresh unavailable; existing data retained" }, { status: error instanceof AuthError ? 401 : 503, headers }); }
}

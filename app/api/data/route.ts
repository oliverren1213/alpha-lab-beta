import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth";
import { loadLabData } from "../../../lib/database";

export async function GET() {
  try {
    const user = await requireSession();
    return NextResponse.json(await loadLabData(user.id), {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
}

import { NextResponse } from "next/server";
import { assertSameOrigin, requireSession } from "../../../lib/auth";
import { createBackup, restoreBackup } from "../../../lib/import-export";

export async function GET() {
  const user = await requireSession();
  return new Response(JSON.stringify(await createBackup(user.id), null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="alpha-lab-backup.json"',
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSession();
    const body = (await request.json()) as { confirm?: string; backup?: unknown };
    if (body.confirm !== "REPLACE") throw new Error("Restore confirmation is missing");
    return NextResponse.json(await restoreBackup(user.id, body.backup));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Restore failed" },
      { status: 400 },
    );
  }
}

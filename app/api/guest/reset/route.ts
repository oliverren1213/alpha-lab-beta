import { NextResponse } from "next/server";
import { assertSameOrigin, requireSession } from "../../../../lib/auth";
import { resetGuestDemoData } from "../../../../lib/database";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireSession();
    if (!user.isGuest) throw new Error("Only guest demo workspaces can be reset");
    await resetGuestDemoData(user.id);
    return NextResponse.json({ reset: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reset demo workspace" },
      { status: 400 },
    );
  }
}

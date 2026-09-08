import { NextResponse } from "next/server";
import { assertSameOrigin, requireSession } from "../../../lib/auth";
import { refreshAllowed, runDailyUpdate, type UpdateTrigger } from "../../../lib/pipeline";
import { onDemandRefreshMode } from "../../../lib/schedule";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireSession();
    const body = (await request.json().catch(() => ({}))) as { trigger?: string };
    const trigger: UpdateTrigger = body.trigger === "STALE_OPEN" ? "STALE_OPEN" : "MANUAL";
    const cooldown = await refreshAllowed(trigger);
    if (!cooldown.allowed) {
      return NextResponse.json(
        { skipped: true, reason: cooldown.reason, retryAfterSeconds: cooldown.retryAfterSeconds },
        { status: 200 },
      );
    }
    return NextResponse.json(await runDailyUpdate(trigger, onDemandRefreshMode()));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refresh failed" },
      { status: 400 },
    );
  }
}

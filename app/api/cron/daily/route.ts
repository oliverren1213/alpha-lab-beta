import { NextResponse } from "next/server";
import { getRuntimeEnv } from "../../../../lib/database";
import { runDailyUpdate } from "../../../../lib/pipeline";
import { scheduledRomeMode } from "../../../../lib/schedule";

export async function POST(request: Request) {
  const secret = getRuntimeEnv().CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const requestedMode = new URL(request.url).searchParams.get("mode")?.toUpperCase();
  const developmentMode = getRuntimeEnv().ALLOW_DEV_REFRESH === "true" &&
    (requestedMode === "MORNING" || requestedMode === "AFTERNOON")
    ? requestedMode
    : null;
  const mode = developmentMode ?? scheduledRomeMode();
  if (!mode) {
    return NextResponse.json({ skipped: true, reason: "Outside the 09:15 or 18:15 Europe/Rome window" });
  }
  return NextResponse.json(await runDailyUpdate("CRON", mode));
}

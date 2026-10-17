import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { transportFromEnv } from "@/lib/email";
import { runUpdate } from "@/lib/jobs/update";
import { providersFromEnv } from "@/lib/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Alternative to the GitHub Actions job for external schedulers: GET with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const res = await runUpdate({
    db,
    providers: providersFromEnv(process.env, { allowSlowSecondary: false }),
    transport: transportFromEnv(),
    trigger: "scheduled",
  });
  return NextResponse.json({ status: res.status, message: res.message, slot: res.slot, sessionDate: res.sessionDate });
}

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { transportFromEnv } from "@/lib/email";
import { runUpdate } from "@/lib/jobs/update";
import { providersFromEnv } from "@/lib/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIN_INTERVAL_MS = 60_000;

export async function POST() {
  const db = await getDb();
  const [last] = await db.query<{ started_at: string }>(
    "SELECT started_at FROM job_runs WHERE trigger = 'manual' ORDER BY started_at DESC LIMIT 1",
  );
  if (last && Date.now() - new Date(last.started_at).getTime() < MIN_INTERVAL_MS) {
    return NextResponse.json({ status: "skipped", message: "Please wait a minute between manual refreshes." }, { status: 429 });
  }
  const providers = providersFromEnv(process.env, { allowSlowSecondary: false });
  const res = await runUpdate({ db, providers, transport: transportFromEnv(), trigger: "manual" });
  return NextResponse.json(
    { status: res.status, message: res.message, sessionDate: res.sessionDate, mode: res.mode, errors: res.errors ?? [] },
    { status: res.status === "failed" ? 502 : 200 },
  );
}

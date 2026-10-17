import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getDb } from "@/lib/db";
import { getAlertSettings, getWatchlistSettings, saveAlertSettings, saveWatchlistSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  return NextResponse.json({ alerts: await getAlertSettings(db), watchlist: await getWatchlistSettings(db) });
}

export async function POST(req: NextRequest) {
  const db = await getDb();
  try {
    const body = (await req.json()) as { alerts?: unknown; watchlist?: unknown };
    const out: Record<string, unknown> = {};
    if (body.alerts) out.alerts = await saveAlertSettings(db, body.alerts as never);
    if (body.watchlist) out.watchlist = await saveWatchlistSettings(db, body.watchlist as never);
    return NextResponse.json(out);
  } catch (e) {
    const message = e instanceof ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

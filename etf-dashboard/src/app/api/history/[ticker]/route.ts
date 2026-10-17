import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { isTrackedTicker } from "@/lib/etfs";
import { loadHistory } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const t = ticker.toUpperCase();
  if (!isTrackedTicker(t)) return NextResponse.json({ error: "Unknown ticker" }, { status: 404 });
  const db = await getDb();
  return NextResponse.json(await loadHistory(db, t));
}

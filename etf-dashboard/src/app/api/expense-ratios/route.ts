import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { TICKERS } from "@/lib/etfs";
import { setExpenseRatio } from "@/lib/repo";

export const dynamic = "force-dynamic";

const schema = z.object({
  ticker: z.enum(TICKERS as [string, ...string[]]),
  ratio: z.number().min(0).max(5),
  source: z.string().url(),
});

/** Record an expense ratio checked on the official fund-provider website. */
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ticker, ratio and an official source URL are required" }, { status: 400 });
  const db = await getDb();
  await setExpenseRatio(db, parsed.data.ticker, parsed.data.ratio, parsed.data.source, new Date().toISOString());
  return NextResponse.json({ ok: true });
}

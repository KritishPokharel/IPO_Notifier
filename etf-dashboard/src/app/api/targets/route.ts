import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { TICKERS } from "@/lib/etfs";

export const dynamic = "force-dynamic";

const schema = z.object({
  ticker: z.enum(TICKERS as [string, ...string[]]),
  direction: z.enum(["below", "above"]),
  targetPrice: z.number().positive(),
});

export async function GET() {
  const db = await getDb();
  return NextResponse.json(await db.query("SELECT * FROM target_price_alerts ORDER BY ticker, target_price"));
}

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid target alert" }, { status: 400 });
  const db = await getDb();
  const [row] = await db.query(
    "INSERT INTO target_price_alerts (ticker, direction, target_price) VALUES ($1, $2, $3) RETURNING *",
    [parsed.data.ticker, parsed.data.direction, parsed.data.targetPrice],
  );
  return NextResponse.json(row);
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const db = await getDb();
  await db.query("DELETE FROM target_price_alerts WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}

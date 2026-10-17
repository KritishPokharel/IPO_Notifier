import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { analysisContext } from "@/lib/ai/context";
import { DEFAULT_MODEL, generateReport } from "@/lib/ai/nvidia";
import { profileSchema } from "@/lib/ai/ranking";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Request must come from this dashboard." }, 403);
  const parsed = profileSchema.safeParse((await req.json().catch(() => null))?.profile);
  if (!parsed.success) return json({ error: "Choose a valid investment profile." }, 400);
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return json({ error: "Add NVIDIA_API_KEY to the server environment to enable AI analysis." }, 503);
  try {
    const context = await analysisContext(parsed.data);
    if (context.ranking.picks.length < 5) return json({ error: `Only ${context.ranking.picks.length} eligible candidates for ${context.ranking.session}. Refresh closing data and resolve the exclusions before generating a top five.` }, 422);
    const db = await getDb();
    const model = process.env.NVIDIA_MODEL || DEFAULT_MODEL;
    // Exclude computation time from the cache identity; include all actual evidence and preferences.
    const evidence = { ...context, snapshot: { ...context.snapshot, computedAt: undefined, analysis: undefined } };
    const hash = createHash("sha256").update(JSON.stringify({ evidence, model, version: 1 })).digest("hex");
    const cacheKey = `ai-report:${parsed.data}`;
    const [cache] = await db.query<{ value: { hash: string; report: unknown; generatedAt: string; model: string }; updated_at: string }>("SELECT value, updated_at FROM settings WHERE key = $1", [cacheKey]);
    if (cache?.value.hash === hash && Date.now() - Date.parse(cache.updated_at) < 900_000) return json({ ...cache.value, ranking: context.ranking, cached: true });
    // Atomic database-backed cooldown also covers concurrent requests / server instances.
    const lease = await db.query(`INSERT INTO settings (key, value, updated_at) VALUES ('ai-request-lease', '{}'::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET updated_at = now()
      WHERE settings.updated_at < now() - interval '120 seconds' RETURNING key`);
    if (!lease.length) return json({ error: "An analysis is running or was recently requested. Please wait two minutes before retrying." }, 429);
    let report;
    try { report = await generateReport(context, context.ranking.picks.map(p => p.etf.ticker), apiKey, model); }
    catch (error) { return json({ error: error instanceof Error && error.name !== "TimeoutError" ? error.message : "The AI request timed out. Please retry shortly." }, 502); }
    const result = { hash, report, generatedAt: new Date().toISOString(), model };
    await db.query(`INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [cacheKey, JSON.stringify(result)]);
    return json({ ...result, ranking: context.ranking, cached: false });
  } catch {
    return json({ error: "Dashboard evidence could not be loaded. Check the database and refresh market data." }, 503);
  }
}

import { AiAnalysis } from "@/components/dashboard/ai-analysis";
import { analysisContext } from "@/lib/ai/context";
import { DEFAULT_MODEL } from "@/lib/ai/nvidia";
import { rankEtfs } from "@/lib/ai/ranking";
export const dynamic = "force-dynamic";
export default async function AiPage() {
  try {
    const context = await analysisContext("balanced");
    const problems = Object.fromEntries(context.ranking.excluded.map(e => [e.ticker, e.reason]));
    const rankings = { balanced: context.ranking, growth: rankEtfs(context.snapshot, "growth", new Date(), problems), defensive: rankEtfs(context.snapshot, "defensive", new Date(), problems) };
    return <AiAnalysis rankings={rankings} configured={Boolean(process.env.NVIDIA_API_KEY)} model={process.env.NVIDIA_MODEL || DEFAULT_MODEL} />;
  } catch {
    return <div role="alert" className="rounded-xl border p-6"><h1 className="text-xl font-semibold">AI analysis is waiting for dashboard data</h1><p className="mt-2 text-sm text-muted-foreground">The database could not be loaded. Check the database configuration, run the market-data update and reload this page.</p></div>;
  }
}

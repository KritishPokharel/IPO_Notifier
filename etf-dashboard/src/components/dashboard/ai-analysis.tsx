"use client";
import { useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowUpRight, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { METHODOLOGY, WEIGHTS, type Profile, type Ranking } from "@/lib/ai/ranking";
import type { AiReport } from "@/lib/ai/nvidia";
import { ETF_BY_TICKER } from "@/lib/etfs";
import { fmtPct, fmtPrice } from "@/lib/format";
interface Result { report: AiReport; ranking: Ranking; generatedAt: string; model: string; cached: boolean }
export function AiAnalysis({ rankings, configured, model }: { rankings: Record<Profile, Ranking>; configured: boolean; model: string }) {
  const [profile, setProfile] = useState<Profile>("balanced");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ranking = result?.ranking ?? rankings[profile];
  async function analyze() {
    setBusy(true); setError(null); setResult(null);
    try {
      const response = await fetch("/api/ai-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }), signal: AbortSignal.timeout(125_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed. Please retry.");
      setResult(data);
    } catch (e) { setError(e instanceof Error && e.name !== "TimeoutError" ? e.message : "Analysis timed out. Please retry."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <section className="rounded-2xl border bg-gradient-to-br from-emerald-500/10 via-background to-background p-6 sm:p-8">
      <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-emerald-600 dark:text-emerald-400"><Sparkles size={16} /> AI research desk</div>
      <h1 className="text-3xl font-semibold tracking-tight">Your next investment, with evidence.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Compare the dashboard’s ETFs and explore five candidates to consider buying. AI explains the evidence, tradeoffs and risks behind a transparent ranking.</p>
      <div className="mt-6 flex flex-wrap items-end gap-4">
        <label className="space-y-2 text-sm"><span className="block font-medium">Research profile · 5+ year horizon</span><select className="rounded-md border bg-background px-3 py-2" value={profile} disabled={busy} onChange={e => { setProfile(e.target.value as Profile); setResult(null); setError(null); }}><option value="balanced">Balanced</option><option value="growth">Growth focused</option><option value="defensive">Lower volatility</option></select></label>
        <Button onClick={analyze} disabled={busy || !configured || ranking.picks.length < 5}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? "Analyzing dashboard…" : "Generate AI analysis"}</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{model} · Analysis can take up to two minutes. The selected profile changes the ranking weights.</p>
    </section>
    {!configured && <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">AI setup needed: add <code>NVIDIA_API_KEY</code> to the server’s <code>.env.local</code> or hosting secrets, then restart. Your key is never sent to the browser.</div>}
    {error && <div role="alert" className="rounded-xl border border-red-500/40 p-4 text-sm text-red-500">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-3">{[["Evidence date", ranking.session], ["Eligible ETFs", `${ranking.eligible} of ${rankings[profile].eligible + rankings[profile].excluded.length}`], ["Price quality", "Independent close cross-check"]].map(([label, value]) => <div key={label} className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>)}</div>
    {result && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles size={18} /> AI investment brief</CardTitle><p className="text-xs text-muted-foreground">{result.model} · Generated {new Date(result.generatedAt).toLocaleString()} {result.cached ? "· Cached" : ""}</p></CardHeader><CardContent className="space-y-4 text-sm leading-6"><p>{result.report.overview}</p><div><h3 className="font-semibold">Across the dashboard</h3><p className="text-muted-foreground">{result.report.marketContext}</p></div><div><h3 className="font-semibold">Portfolio overlap & risks</h3><p className="text-muted-foreground">{result.report.portfolioRisks}</p></div><div><h3 className="font-semibold">What the evidence cannot tell us</h3><p className="text-muted-foreground">{result.report.limitations}</p></div></CardContent></Card>}
    <div><h2 className="text-xl font-semibold">{ranking.picks.length === 5 ? "Top five candidates" : "Awaiting a verified top five"}</h2><p className="mt-1 text-sm text-muted-foreground">{result ? "AI commentary with database evidence below." : "Quantitative shortlist. Generate the AI analysis for interpretation."} These are alternatives to research, not an allocation to buy all five.</p></div>
    {ranking.picks.length < 5 && <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{ranking.picks.length} candidates currently qualify. Run the completed-session update with both free data keys configured; review exclusions below. AI will not fill missing slots with unsupported picks.</p>}
    <div className="grid gap-4 lg:grid-cols-2">{ranking.picks.map(({ etf: e, score, factors }, i) => {
      const commentary = result?.report.picks.find(p => p.ticker === e.ticker);
      return <Card key={e.ticker}><CardHeader><div className="flex items-start justify-between"><div><p className="mb-2 text-xs text-muted-foreground">CANDIDATE {i + 1} · {e.group}</p><CardTitle className="text-2xl"><Link href={`/etf/${e.ticker}`} className="inline-flex items-center gap-2 hover:underline">{e.ticker}<ArrowUpRight size={18} /></Link></CardTitle><p className="mt-1 text-xs text-muted-foreground">{e.name}</p></div><div className="text-right"><p className="text-2xl font-semibold tabular-nums">{score}<span className="text-xs text-muted-foreground"> / 100</span></p><p className="text-xs text-muted-foreground">Relative score</p></div></div></CardHeader>
      <CardContent className="space-y-4 text-sm"><dl className="grid grid-cols-3 gap-3">{[["Verified close", fmtPrice(e.price)], ["1Y price return", fmtPct(e.priceReturns["1Y"])], ["1Y volatility", fmtPct(e.vol1y)], ["1Y max drawdown", fmtPct(e.maxDrawdown1y?.pct)], ["From 52W high", fmtPct(e.pctFromHigh52w)], ["Expense ratio", `${e.expense.ratio}%`]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium tabular-nums">{value}</dd></div>)}</dl>
      <p className="text-xs text-muted-foreground">Fee: {e.expense.status === "verified" ? `verified ${e.expense.verifiedAt ?? ""}` : "unverified reference; confirm with issuer"}. Historical returns and risk are calculated from provider history.</p>
      {commentary && <div className="space-y-3 border-t pt-4"><p><strong>Why consider it: </strong>{commentary.thesis}</p><p><strong>Main risk: </strong>{commentary.risk}</p><p><strong>Watch next: </strong>{commentary.watchFor}</p></div>}
      <p className="text-xs text-muted-foreground">{e.concentrationRisk}</p>
      <details className="rounded-lg bg-muted/40 p-3 text-xs"><summary className="cursor-pointer font-medium">Evidence & score breakdown</summary><div className="mt-3 space-y-2"><p className="flex items-center gap-1"><ShieldCheck size={14} /> {e.latest?.source}: {fmtPrice(e.price)} · {e.latest?.secondarySource}: {fmtPrice(e.latest?.secondaryPrice)}</p><p>Session {e.latest?.sessionDate} · discrepancy {fmtPct(e.latest?.discrepancyPct)} · retrieved {e.latest?.retrievedAt ?? "unknown"}</p><p>{Object.entries(factors).map(([k, v]) => `${k}: ${v.toFixed(1)} (${WEIGHTS[profile][k as keyof typeof factors]}% weight)`).join(" · ")}</p><p>1Y dividend-adjusted total return: {fmtPct(e.totalReturns["1Y"])} as of {e.totalReturnsAsOf ?? "unknown"}.</p><a className="underline" href={ETF_BY_TICKER[e.ticker].providerUrl} target="_blank" rel="noreferrer">Official issuer / fee source</a></div></details>
      </CardContent></Card>;
    })}</div>
    {ranking.excluded.length > 0 && <details className="rounded-xl border p-4" open={ranking.picks.length < 5}><summary className="cursor-pointer text-sm font-medium">Excluded from ranking ({ranking.excluded.length})</summary><ul className="mt-3 space-y-2 text-sm text-muted-foreground">{ranking.excluded.map(e => <li key={e.ticker}><strong>{e.ticker}</strong> — {e.reason}</li>)}</ul></details>}
    <Card><CardHeader><CardTitle>Methodology & free data</CardTitle></CardHeader><CardContent className="space-y-3 text-sm leading-6 text-muted-foreground"><p>{METHODOLOGY}</p><p>Latest completed-session closes must match an independent source. Historical analytics are calculated from Tiingo data; cross-checking the latest close does not verify the entire history. Missing sessions and disputed observations in the scoring window block eligibility.</p><p><a className="underline" href="https://www.tiingo.com/documentation/">Tiingo</a> supplies daily history. <a className="underline" href="https://twelvedata.com/pricing">Twelve Data Basic</a> supplies free US ETF cross-checks (8 credits/minute, 800/day). Free accounts need their own API keys and are subject to coverage and usage terms. Source failures remain unverified.</p><p>AI prose is interpretation and can be wrong. Scores do not predict returns. This equity-only universe does not include bonds or cash, and a lower-volatility profile can still lose substantial value.</p></CardContent></Card>
  </div>;
}

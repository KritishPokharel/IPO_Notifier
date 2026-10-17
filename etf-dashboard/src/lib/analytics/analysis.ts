import type { SectorGroup } from "../etfs";
import { DRAWDOWN_CLASSES } from "./calc";
import type { EtfMetrics } from "./metrics";

export interface AnalysisSection {
  title: string;
  items: string[];
}

export interface Analysis {
  sessionDate: string;
  basis: "final-close" | "intraday";
  generatedAt: string;
  /** Statements computed directly from validated data. */
  observations: AnalysisSection[];
  /** Hedged interpretations of the observations; never causal claims. */
  interpretations: string[];
  excluded: string[];
}

const pct = (v: number | null, dp = 2) => (v === null ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(dp)}%`);
const usable = (e: EtfMetrics) => e.status === "verified" || e.status === "single_source";

function groupAvg(etfs: EtfMetrics[], group: SectorGroup): { avg: number | null; members: EtfMetrics[] } {
  const members = etfs.filter((e) => e.group === group && e.dailyChangePct !== null);
  if (!members.length) return { avg: null, members };
  return { avg: members.reduce((a, e) => a + e.dailyChangePct!, 0) / members.length, members };
}

export function generateAnalysis(
  all: EtfMetrics[],
  previous: EtfMetrics[] | null,
  sessionDate: string,
  basis: Analysis["basis"],
  now = new Date(),
): Analysis {
  const etfs = all.filter(usable);
  const excluded = all.filter((e) => !usable(e)).map((e) => `${e.ticker} (${e.status.replace("_", "-")})`);
  const withChange = etfs.filter((e) => e.dailyChangePct !== null).sort((a, b) => b.dailyChangePct! - a.dailyChangePct!);
  const line = (e: EtfMetrics) => `${e.ticker} ${pct(e.dailyChangePct)} (${e.category})`;
  const observations: AnalysisSection[] = [];

  observations.push({
    title: "Biggest daily gainers",
    items: withChange.filter((e) => e.dailyChangePct! > 0).slice(0, 3).map(line),
  });
  observations.push({
    title: "Biggest daily losers",
    items: withChange.filter((e) => e.dailyChangePct! < 0).reverse().slice(0, 3).map(line),
  });
  observations.push({
    title: "Near 52-week lows",
    items: etfs
      .filter((e) => e.pctAboveLow52w !== null && e.pctAboveLow52w <= 5)
      .map((e) => `${e.ticker} is ${e.pctAboveLow52w!.toFixed(2)}% above its 52-week low of $${e.low52w!.value.toFixed(2)}`),
  });
  observations.push({
    title: "Significant corrections (≥10% below 52-week high)",
    items: etfs
      .filter((e) => e.pctFromHigh52w !== null && e.pctFromHigh52w <= -10)
      .sort((a, b) => a.pctFromHigh52w! - b.pctFromHigh52w!)
      .map((e) => `${e.ticker} ${pct(e.pctFromHigh52w)} from 52-week high — ${e.drawdownClass}`),
  });

  const groups: [SectorGroup, string][] = [
    ["Semiconductors", "Semiconductor ETFs"],
    ["Technology", "Technology ETFs"],
    ["Broad U.S.", "Broad U.S. market ETFs"],
    ["U.S. Growth", "U.S. large-cap growth ETFs"],
    ["International", "International ETFs"],
  ];
  const avgs: Partial<Record<SectorGroup, number | null>> = {};
  for (const [g, title] of groups) {
    const { avg, members } = groupAvg(etfs, g);
    avgs[g] = avg;
    observations.push({
      title,
      items: members.length
        ? [`Average ${pct(avg)}: ${members.map((m) => `${m.ticker} ${pct(m.dailyChangePct)}`).join(", ")}`]
        : [],
    });
  }

  const prevByTicker = new Map((previous ?? []).map((p) => [p.ticker, p]));
  const crossings: string[] = [];
  for (const e of etfs) {
    const p = prevByTicker.get(e.ticker);
    if (!p?.drawdownClass || !e.drawdownClass || p.drawdownClass === e.drawdownClass) continue;
    const worse = DRAWDOWN_CLASSES.indexOf(e.drawdownClass) > DRAWDOWN_CLASSES.indexOf(p.drawdownClass);
    crossings.push(`${e.ticker} moved from "${p.drawdownClass}" to "${e.drawdownClass}" (${worse ? "deeper" : "recovering"}; now ${pct(e.pctFromHigh52w)} from high)`);
  }
  observations.push({ title: "Drawdown threshold crossings", items: crossings });

  observations.push({
    title: "Unusual volatility",
    items: etfs
      .filter((e) => (e.dailyZ !== null && Math.abs(e.dailyZ) >= 2) || (e.vol20d !== null && e.vol1y !== null && e.vol20d > 1.5 * e.vol1y))
      .map((e) => {
        const parts: string[] = [];
        if (e.dailyZ !== null && Math.abs(e.dailyZ) >= 2) parts.push(`today's move is ${Math.abs(e.dailyZ).toFixed(1)} standard deviations`);
        if (e.vol20d !== null && e.vol1y !== null && e.vol20d > 1.5 * e.vol1y)
          parts.push(`20-day volatility ${e.vol20d.toFixed(1)}% vs 1-year ${e.vol1y.toFixed(1)}%`);
        return `${e.ticker}: ${parts.join("; ")}`;
      }),
  });

  const interpretations: string[] = [];
  const semi = avgs["Semiconductors"];
  const broad = avgs["Broad U.S."];
  const intl = avgs["International"];
  const tech = avgs["Technology"];
  if (semi != null && broad != null && Math.abs(semi - broad) >= 1) {
    interpretations.push(
      `Semiconductor ETFs ${semi < broad ? "underperformed" : "outperformed"} the broad U.S. market by ${Math.abs(semi - broad).toFixed(2)} percentage points. ` +
        "This is consistent with their higher industry concentration and volatility; the data alone does not identify the cause.",
    );
  }
  if (tech != null && broad != null && Math.abs(tech - broad) >= 0.75) {
    interpretations.push(
      `Technology ETFs ${tech < broad ? "lagged" : "led"} the broad U.S. market (${pct(tech)} vs ${pct(broad)}).`,
    );
  }
  if (intl != null && broad != null && Math.abs(intl - broad) >= 0.75) {
    interpretations.push(
      `International ETFs ${intl < broad ? "underperformed" : "outperformed"} U.S. broad-market ETFs (${pct(intl)} vs ${pct(broad)}); currency moves can contribute to this difference.`,
    );
  }
  if (!interpretations.length && withChange.length) {
    interpretations.push("No category diverged meaningfully from the broad U.S. market in this update.");
  }

  return {
    sessionDate,
    basis,
    generatedAt: now.toISOString(),
    observations,
    interpretations,
    excluded,
  };
}

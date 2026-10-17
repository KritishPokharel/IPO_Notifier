import type { EtfMetrics } from "./metrics";

export interface Summary {
  total: number;
  up: number;
  down: number;
  unchanged: number;
  biggestGainer: EtfMetrics | null;
  biggestLoser: EtfMetrics | null;
  furthestBelowHigh: EtfMetrics | null;
  downMoreThan10: number;
  downMoreThan20: number;
}

export function summarize(etfs: EtfMetrics[]): Summary {
  const withChange = etfs.filter((e) => e.dailyChangePct !== null);
  const withDd = etfs.filter((e) => e.pctFromHigh52w !== null);
  const by = <T,>(xs: T[], f: (x: T) => number) => [...xs].sort((a, b) => f(a) - f(b));
  const asc = by(withChange, (e) => e.dailyChangePct!);
  return {
    total: etfs.length,
    up: withChange.filter((e) => e.dailyChangePct! > 0).length,
    down: withChange.filter((e) => e.dailyChangePct! < 0).length,
    unchanged: withChange.filter((e) => e.dailyChangePct === 0).length,
    biggestGainer: asc.length && asc[asc.length - 1].dailyChangePct! > 0 ? asc[asc.length - 1] : null,
    biggestLoser: asc.length && asc[0].dailyChangePct! < 0 ? asc[0] : null,
    furthestBelowHigh: by(withDd, (e) => e.pctFromHigh52w!)[0] ?? null,
    downMoreThan10: withDd.filter((e) => e.pctFromHigh52w! <= -10).length,
    downMoreThan20: withDd.filter((e) => e.pctFromHigh52w! <= -20).length,
  };
}

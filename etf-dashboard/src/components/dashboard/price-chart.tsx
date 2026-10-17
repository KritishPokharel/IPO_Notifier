"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { smaSeries } from "@/lib/analytics/calc";
import { fmtDate, fmtPct, fmtPrice } from "@/lib/format";
import { addDays } from "@/lib/market/time";
import type { HistoryPayload } from "@/lib/queries";
import { cn } from "@/lib/utils";

const RANGES = ["5D", "1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "Max"] as const;
type Range = (typeof RANGES)[number];
const RANGE_DAYS: Record<Exclude<Range, "YTD" | "Max">, number> = { "5D": 7, "1M": 31, "3M": 92, "6M": 183, "1Y": 366, "3Y": 1096, "5Y": 1827 };

function rangeStart(range: Range, last: string): string | null {
  if (range === "Max") return null;
  if (range === "YTD") return `${last.slice(0, 4)}-01-01`;
  return addDays(last, -RANGE_DAYS[range]);
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button size="sm" variant={on ? "secondary" : "ghost"} className="h-7 px-2 text-xs" onClick={onClick}>
      {children}
    </Button>
  );
}

export function PriceChart({ ticker, high52w, low52w }: { ticker: string; high52w: number | null; low52w: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { resolvedTheme } = useTheme();
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("1Y");
  const [candles, setCandles] = useState(false);
  const [total, setTotal] = useState(false);
  const [mas, setMas] = useState({ 20: false, 50: true, 200: true });
  const [volume, setVolume] = useState(true);
  const [levels, setLevels] = useState(true);
  const [hover, setHover] = useState<{ date: string; close: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/history/${ticker}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: HistoryPayload) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const view = useMemo(() => {
    if (!data || !data.dates.length) return null;
    const series = total ? data.totalClose : data.close;
    const maFull = { 20: smaSeries(series, 20), 50: smaSeries(series, 50), 200: smaSeries(series, 200) };
    const start = rangeStart(range, data.dates[data.dates.length - 1]);
    const i0 = start ? Math.max(0, data.dates.findIndex((d) => d >= start)) : 0;
    const idx = data.dates.map((_, i) => i).slice(i0);
    const first = series[idx[0]];
    const lastV = series[idx[idx.length - 1]];
    return { series, maFull, idx, change: first ? ((lastV - first) / first) * 100 : null };
  }, [data, range, total]);

  useEffect(() => {
    if (!ref.current || !data || !view) return;
    const dark = resolvedTheme !== "light";
    const text = dark ? "#a1a1aa" : "#52525b";
    const grid = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text, attributionLogo: false },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;
    const t = (i: number) => data.dates[i] as Time;
    const up = "#10b981";
    const down = "#ef4444";
    const priceSeries = candles && !total
      ? (() => {
          const s = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down });
          s.setData(view.idx.map((i) => ({ time: t(i), open: data.open[i], high: data.high[i], low: data.low[i], close: data.close[i] })));
          return s;
        })()
      : (() => {
          const s = chart.addSeries(LineSeries, { color: (view.change ?? 0) >= 0 ? up : down, lineWidth: 2, priceLineVisible: false });
          s.setData(view.idx.map((i) => ({ time: t(i), value: view.series[i] })));
          return s;
        })();
    const maColors = { 20: "#a78bfa", 50: "#f59e0b", 200: "#38bdf8" } as const;
    for (const n of [20, 50, 200] as const) {
      if (!mas[n]) continue;
      const s = chart.addSeries(LineSeries, { color: maColors[n], lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(view.idx.filter((i) => view.maFull[n][i] !== null).map((i) => ({ time: t(i), value: view.maFull[n][i]! })));
    }
    if (levels && !total) {
      if (high52w) priceSeries.createPriceLine({ price: high52w, color: up, lineStyle: LineStyle.Dashed, lineWidth: 1, title: "52W high" });
      if (low52w) priceSeries.createPriceLine({ price: low52w, color: down, lineStyle: LineStyle.Dashed, lineWidth: 1, title: "52W low" });
    }
    if (volume) {
      const v = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      v.setData(
        view.idx
          .filter((i) => data.volume[i] !== null)
          .map((i) => ({ time: t(i), value: data.volume[i]!, color: i > 0 && data.close[i] < data.close[i - 1] ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.35)" })),
      );
    }
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((p) => {
      const d = p.time as string | undefined;
      const i = d ? data.dates.indexOf(d) : -1;
      setHover(i >= 0 ? { date: d!, close: view.series[i] } : null);
    });
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, view, candles, total, mas, volume, levels, resolvedTheme, high52w, low52w]);

  if (error) return <div className="flex h-96 items-center justify-center text-sm text-red-400">Could not load price history: {error}</div>;
  if (!data) return <Skeleton className="h-96 w-full" />;
  if (!data.dates.length) return <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">No stored history for {ticker} yet.</div>;

  const recentIntraday = data.intraday.filter((o) => o.kind === "intraday").slice(-6).reverse();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {RANGES.map((r) => (
          <Toggle key={r} on={range === r} onClick={() => setRange(r)}>
            {r}
          </Toggle>
        ))}
        <span className="mx-2 h-4 w-px bg-border" />
        <Toggle on={!candles} onClick={() => setCandles(false)}>Line</Toggle>
        <Toggle on={candles} onClick={() => { setCandles(true); setTotal(false); }}>Candles</Toggle>
        <Toggle on={total} onClick={() => { setTotal(!total); setCandles(false); }}>Total return</Toggle>
        <span className="mx-2 h-4 w-px bg-border" />
        {([20, 50, 200] as const).map((n) => (
          <Toggle key={n} on={mas[n]} onClick={() => setMas((m) => ({ ...m, [n]: !m[n] }))}>
            MA{n}
          </Toggle>
        ))}
        <Toggle on={volume} onClick={() => setVolume(!volume)}>Volume</Toggle>
        <Toggle on={levels} onClick={() => setLevels(!levels)}>52W levels</Toggle>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 text-sm">
        <span className="text-muted-foreground">
          {range} change ({total ? "dividend-adjusted total return" : "price return"}):{" "}
          <span className={cn((view?.change ?? 0) >= 0 ? "text-emerald-500" : "text-red-500")}>{fmtPct(view?.change)}</span>
        </span>
        {hover ? (
          <span className="tabular-nums">
            {fmtDate(hover.date)} · {total ? hover.close.toFixed(2) : fmtPrice(hover.close)}
          </span>
        ) : null}
      </div>
      <div ref={ref} className="h-96 w-full" />
      <p className="text-xs text-muted-foreground">
        Daily bars are split-adjusted official closes; &quot;Total return&quot; reinvests distributions. Charts show only stored data points —
        no values are interpolated. Intraday data is limited to the three scheduled observations per day
        {recentIntraday.length ? ":" : "."}
      </p>
      {recentIntraday.length ? (
        <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          {recentIntraday.map((o) => (
            <li key={o.time + o.source}>
              {new Date(o.time).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET ·{" "}
              {fmtPrice(o.price)} · {o.source}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

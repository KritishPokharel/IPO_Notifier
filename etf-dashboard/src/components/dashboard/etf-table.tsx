"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EtfMetrics } from "@/lib/analytics/metrics";
import { changeColor, fmtMoneyChange, fmtPct, fmtPrice } from "@/lib/format";
import { Change, DrawdownBadge, StatusBadge } from "./badges";

type Col = {
  key: string;
  label: string;
  value: (e: EtfMetrics) => number | string | null;
  render: (e: EtfMetrics) => React.ReactNode;
  align?: "right";
};

const COLS: Col[] = [
  {
    key: "ticker",
    label: "ETF",
    value: (e) => e.ticker,
    render: (e) => (
      <Link href={`/etf/${e.ticker}`} className="group block">
        <span className="font-semibold group-hover:underline">{e.ticker}</span>
        <span className="block max-w-[14rem] truncate text-xs text-muted-foreground">{e.name}</span>
      </Link>
    ),
  },
  { key: "category", label: "Category", value: (e) => e.category, render: (e) => <span className="text-xs text-muted-foreground">{e.category}</span> },
  { key: "price", label: "Price", value: (e) => e.price, render: (e) => fmtPrice(e.price), align: "right" },
  { key: "prev", label: "Prev close", value: (e) => e.prevClose, render: (e) => fmtPrice(e.prevClose), align: "right" },
  {
    key: "chg",
    label: "Day $",
    value: (e) => e.dailyChange,
    render: (e) => <span className={changeColor(e.dailyChange)}>{fmtMoneyChange(e.dailyChange)}</span>,
    align: "right",
  },
  { key: "chgPct", label: "Day %", value: (e) => e.dailyChangePct, render: (e) => <Change value={e.dailyChangePct} />, align: "right" },
  { key: "h52", label: "52W high", value: (e) => e.high52w?.value ?? null, render: (e) => fmtPrice(e.high52w?.value), align: "right" },
  { key: "l52", label: "52W low", value: (e) => e.low52w?.value ?? null, render: (e) => fmtPrice(e.low52w?.value), align: "right" },
  {
    key: "dd",
    label: "From 52W high",
    value: (e) => e.pctFromHigh52w,
    render: (e) => <span className={changeColor(e.pctFromHigh52w)}>{fmtPct(e.pctFromHigh52w)}</span>,
    align: "right",
  },
  { key: "ddc", label: "Drawdown", value: (e) => e.pctFromHigh52w, render: (e) => <DrawdownBadge cls={e.drawdownClass} /> },
  { key: "status", label: "Data", value: (e) => e.status, render: (e) => <StatusBadge status={e.status} note={e.statusNote} /> },
];

export function EtfTable({ etfs, initialSort = "ticker" }: { etfs: EtfMetrics[]; initialSort?: string }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: initialSort, dir: 1 });
  const rows = useMemo(() => {
    const col = COLS.find((c) => c.key === sort.key)!;
    return [...etfs].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [etfs, sort]);
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLS.map((c) => (
              <TableHead key={c.key} className={c.align === "right" ? "text-right" : undefined}>
                <button
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}
                >
                  {c.label}
                  {sort.key === c.key ? sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => (
            <TableRow key={e.ticker}>
              {COLS.map((c) => (
                <TableCell key={c.key} className={c.align === "right" ? "text-right tabular-nums" : undefined}>
                  {c.render(e)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

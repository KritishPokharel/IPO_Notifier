import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DrawdownClass } from "@/lib/analytics/calc";
import { changeColor, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STATUS_DESCRIPTIONS, STATUS_LABELS, type DataStatus } from "@/lib/validation";

const STATUS_STYLE: Record<DataStatus, string> = {
  verified: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  single_source: "border-sky-500/40 bg-sky-500/10 text-sky-500",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  stale: "border-orange-500/40 bg-orange-500/10 text-orange-500",
  disputed: "border-red-500/40 bg-red-500/10 text-red-500",
};

export function StatusBadge({ status, note }: { status: DataStatus; note?: string | null }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn("cursor-help whitespace-nowrap", STATUS_STYLE[status])}>
          {STATUS_LABELS[status]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>{STATUS_DESCRIPTIONS[status]}</p>
        {note ? <p className="mt-1 opacity-80">{note}</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}

const DD_STYLE: Record<DrawdownClass, string> = {
  "Near high": "border-emerald-500/40 text-emerald-500",
  "Mild pullback": "border-lime-500/40 text-lime-500",
  "Moderate correction": "border-amber-500/40 text-amber-500",
  "Significant correction": "border-orange-500/40 text-orange-500",
  "Bear-market territory": "border-red-500/40 text-red-500",
  "Severe drawdown": "border-red-700/60 bg-red-700/15 text-red-400",
};

export function DrawdownBadge({ cls }: { cls: DrawdownClass | null }) {
  if (!cls) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", DD_STYLE[cls])}>
      {cls}
    </Badge>
  );
}

export function Change({ value, dp = 2, className }: { value: number | null | undefined; dp?: number; className?: string }) {
  return <span className={cn("tabular-nums", changeColor(value), className)}>{fmtPct(value, dp)}</span>;
}

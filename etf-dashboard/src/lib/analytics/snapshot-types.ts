import type { Analysis } from "./analysis";
import type { EtfMetrics } from "./metrics";

export interface Snapshot {
  version: 1;
  sessionDate: string;
  slot: string;
  computedAt: string;
  basis: "final-close" | "intraday" | "mixed";
  etfs: EtfMetrics[];
  analysis: Analysis;
}

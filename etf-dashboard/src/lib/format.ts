export const fmtPrice = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtSigned = (v: number | null | undefined, dp = 2) =>
  v === null || v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dp)}`;

export const fmtPct = (v: number | null | undefined, dp = 2) => (v === null || v === undefined ? "—" : `${fmtSigned(v, dp)}%`);

export const fmtMoneyChange = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`;

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

export const changeColor = (v: number | null | undefined) =>
  v === null || v === undefined || v === 0 ? "text-muted-foreground" : v > 0 ? "text-emerald-500" : "text-red-500";

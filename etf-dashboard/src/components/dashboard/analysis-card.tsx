import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Analysis } from "@/lib/analytics/analysis";
import { fmtDate } from "@/lib/format";

export function AnalysisCard({ analysis }: { analysis: Analysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily market analysis</CardTitle>
        <CardDescription>
          {fmtDate(analysis.sessionDate)} · based on {analysis.basis === "final-close" ? "official closing prices" : "intraday prices (not final)"}.
          Observations are computed from validated data; interpretations are hedged and not causal claims.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {analysis.observations.map((s) => (
          <div key={s.title}>
            <h3 className="mb-2 text-sm font-medium">{s.title}</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
        {analysis.interpretations.length ? (
          <div className="md:col-span-2">
            <h3 className="mb-2 text-sm font-medium">Interpretation</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {analysis.interpretations.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {analysis.excluded.length ? (
          <p className="text-xs text-amber-500 md:col-span-2">Excluded from analysis (not validated): {analysis.excluded.join(", ")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

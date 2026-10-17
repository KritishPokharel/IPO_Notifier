import { AlertSettingsForm } from "@/components/dashboard/alert-settings-form";
import { StatusBadge } from "@/components/dashboard/badges";
import { PageHeader } from "@/components/dashboard/empty";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { recentAlerts } from "@/lib/alerts";
import { getDb } from "@/lib/db";
import { transportFromEnv } from "@/lib/email";
import { fmtDate, fmtPct, fmtPrice } from "@/lib/format";
import { formatEt } from "@/lib/market/time";
import { providersFromEnv } from "@/lib/providers";
import { recentJobs } from "@/lib/repo";
import { getAlertSettings, getWatchlistSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const JOB_COLOR: Record<string, string> = {
  success: "text-emerald-500",
  partial: "text-amber-500",
  failed: "text-red-400",
  running: "text-sky-500",
  skipped: "text-muted-foreground",
};

export default async function AlertsPage() {
  const db = await getDb();
  const [settings, watchlist, targets, alerts, jobs, deliveries] = await Promise.all([
    getAlertSettings(db),
    getWatchlistSettings(db),
    db.query<{ id: number; ticker: string; direction: "below" | "above"; target_price: number }>(
      "SELECT id, ticker, direction, target_price FROM target_price_alerts ORDER BY ticker, target_price",
    ),
    recentAlerts(db, 50),
    recentJobs(db, 25),
    db.query<{ id: number; kind: string; recipient: string; subject: string; status: string; attempts: number; error: string | null; created_at: string }>(
      "SELECT id, kind, recipient, subject, status, attempts, error, created_at FROM email_deliveries ORDER BY created_at DESC LIMIT 10",
    ),
  ]);
  const transport = transportFromEnv();
  const providers = providersFromEnv();
  return (
    <>
      <PageHeader title="Alert settings" description="Configure price-drop emails. No daily summary emails are ever sent." />
      <AlertSettingsForm initial={settings} watchlist={watchlist} targets={targets} emailConfigured={!!transport} />

      <Card>
        <CardHeader>
          <CardTitle>Alert history</CardTitle>
          <CardDescription>Every alert that met its condition, with delivery status. Duplicates for the same ETF and session are never recorded.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {alerts.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>ETF</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Prev close</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{fmtDate(a.session_date)}</TableCell>
                    <TableCell className="font-medium">{a.ticker}</TableCell>
                    <TableCell className="text-xs">{a.alert_type === "daily_drop" ? `Drop > ${a.threshold}%` : `Target ${fmtPrice(Number(a.threshold))}`}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPrice(a.prev_close)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPrice(a.price)}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-500">{fmtPct(a.change_pct)}</TableCell>
                    <TableCell className="text-xs">{a.trigger_kind === "close" ? "Close" : `Intraday (${a.slot})`} · {formatEt(a.observation_ts)}</TableCell>
                    <TableCell><StatusBadge status={a.verification_status} /></TableCell>
                    <TableCell>
                      <Badge variant="outline" className={a.email_status === "sent" ? "text-emerald-500" : a.email_status === "failed" ? "text-red-400" : ""} title={a.delivery_error ?? undefined}>
                        {a.email_status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No alerts have been triggered yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Update log</CardTitle>
            <CardDescription>
              Scheduled at 10:30 AM, 2:30 PM and 7:30 PM ET on trading days. Primary: {providers.primary?.name ?? "not configured"} · Cross-check:{" "}
              {providers.secondaryClose?.name ?? "not configured"}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {jobs.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started (ET)</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell className="whitespace-nowrap text-xs">{formatEt(j.started_at)}</TableCell>
                      <TableCell className="text-xs">{j.job_type}{j.slot ? ` · ${j.slot}` : ""}{j.session_date ? ` · ${j.session_date}` : ""} <span className="text-muted-foreground">({j.trigger})</span></TableCell>
                      <TableCell className={`text-xs ${JOB_COLOR[j.status] ?? ""}`}>{j.status}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={j.message ?? undefined}>{j.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <p className="text-sm text-muted-foreground">No update has run yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Email deliveries</CardTitle>
            <CardDescription>Provider: {transport?.name ?? "not configured"}. Failed sends are retried with backoff and again on the next update.</CardDescription>
          </CardHeader>
          <CardContent>
            {deliveries.length ? (
              <ul className="divide-y text-xs">
                {deliveries.map((d) => (
                  <li key={d.id} className="py-2">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{d.subject}</span>
                      <span className={d.status === "sent" ? "text-emerald-500" : d.status === "failed" ? "text-red-400" : ""}>{d.status}</span>
                    </div>
                    <div className="text-muted-foreground">
                      {formatEt(d.created_at)} ET · {d.kind} · to {d.recipient} · {d.attempts} attempt(s){d.error ? ` · ${d.error}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No emails sent yet.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

# ETF Tracker: Market Analysis & Price-Drop Alerts

A self-hosted dashboard for long-term investors that tracks 12 ETFs (VOO, VTI, SCHG, VUG, VGT, FTEC, SCHF, SCHE, VXUS, SOXQ, SOXX, SMH).
It shows daily moves, drawdowns, historical returns, volatility and category trends. When a **validated** ETF closes (or trades at a
scheduled check) **more than 5% below** its previous trading-day close, it sends **one** email.

It does not send daily summary emails or fill in made-up prices. Every number shows its source, timestamp and verification status.

## Features

| Page | What it shows |
| --- | --- |
| **Overview** | Market open/closed state and which session is shown, up/down counts, biggest gainer/loser, furthest below 52W high, a sortable table (price, previous close, $/% change, 52W range, drawdown class, data status), category averages, and a daily written analysis |
| **ETF detail** (`/etf/VOO`) | Interactive chart (5D–Max, line or candles, price or total return, MA20/50/200, volume, 52W levels), price provenance, 30/90-day/52W/all-time extremes, max drawdown, volatility, streaks, price vs. total returns, expense ratio and fee per $10k |
| **Biggest Drops** | Daily decliners and distance from 52W high, plus drawdown classification buckets |
| **Compare** | Presets (VOO/VTI, SCHG/VUG, VGT/FTEC, SCHF/SCHE/VXUS, SOXQ/SOXX/SMH) or any ≤6 ETFs: cumulative-return chart from a common start date, plus risk/cost table |
| **Historical Analysis** | 1W–5Y and YTD price and total returns, moving averages, volatility, max drawdowns |
| **Watchlist** | Objective research flags (drawdown levels, near 90-day/52W low, below 200-day average, unusual moves). These are flags, not recommendations |
| **Alert Settings** | Recipient, threshold, on/off, ETF selection, single-source policy, target-price alerts, test email, alert history, update log, email delivery log |

Dark mode is the default. A light theme is available, and the layout works on mobile.

## Architecture

```
GitHub Actions cron (UTC, both DST offsets)        Next.js app (dashboard + API)
        │  npm run job:update                              │ reads snapshots / history
        ▼                                                  ▼
  src/lib/jobs/update.ts ── providers (Tiingo, Massive|Twelve Data) ──► validation ──► Postgres
        │                                                                              ▲
        └── analytics snapshot ──► alerts (dedupe) ──► email (Resend | SMTP) ──────────┘
```

- **Next.js 15 / React 19 / TypeScript / Tailwind / shadcn/ui**, with `lightweight-charts` for price charts and Recharts for comparisons.
- **Postgres** in production (`DATABASE_URL`). Without it, the app uses **PGlite** (embedded Postgres) in `.data/pglite`. The schema is created idempotently at startup (`src/lib/db/schema.ts`).
- **Pure calculation modules** (`src/lib/analytics/calc.ts`, `metrics.ts`) are deterministic and unit-tested.
- **NYSE calendar** (`src/lib/market/calendar.ts`) covers holidays, observance rules, Good Friday, Juneteenth, early closes and one-off closures. Times are computed in `America/New_York`.

### Tables

`daily_prices` (official OHLCV, adjusted closes, dividends, splits, per-close verification), `price_observations` (each scheduled
quote/close with source, quote and retrieval timestamps, session, intraday/close kind, status, cross-check value and discrepancy),
`metrics_snapshots` (computed analytics per session/slot), `job_runs`, `alert_events` (unique per ETF + session + alert type),
`email_deliveries`, `settings`, `target_price_alerts`, `etfs`, `expense_ratio_history`.

## Data providers (evaluation)

| Provider | Use here | Free tier (as published by the provider; check current terms) | Notes |
| --- | --- | --- | --- |
| **Tiingo** | **Primary**: full split/dividend-adjusted daily history back to inception, and IEX real-time quotes | Free account with hourly/daily request limits that fit 12 tickers × 3 runs | Documented API with official EOD closes, dividends and split factors. IEX quotes cover only IEX-exchange trades, so intraday values are labelled with the field used (last trade or mid) and its timestamp |
| **Massive (formerly Polygon.io)** | **Close cross-check** (preferred) | Free plan: end-of-day aggregates, about 5 req/min | One "grouped daily" request returns every U.S. ticker's official close for a session |
| **Twelve Data** | Alternative close or quote cross-check | Free plan: about 8 req/min, 800/day | Supported when `TWELVEDATA_API_KEY` is set. Requests are batched and throttled |
| Yahoo Finance (unofficial) | Not used | n/a | No official API or terms for programmatic use, so it was rejected for reliability |
| Alpha Vantage | Not used | Free plan has very low daily limits | Too few calls for 12 ETFs × 3 runs plus backfill |

No paid plan is required. If a provider changes its free tier, the provider interface (`src/lib/providers/types.ts`) lets you add a replacement in one file.

### Validation and verification

- Prices that are missing, zero, negative, non-numeric, outside the day's high/low, or untimestamped are rejected.
- Intraday quotes must be from the current session's regular hours and newer than `MAX_QUOTE_AGE_MINUTES` (20). Older quotes are labelled **Stale**.
- Split-like jumps with no recorded split are rejected. One-day moves above `MAX_UNCONFIRMED_MOVE_PCT` (15%) need confirmation from a second source.
- At the evening run, the primary close is compared with the second source's official close (tolerance 0.1% or $0.011):
  - Sources agree: **Verified**.
  - Sources disagree: **Disputed**. Both values are stored and shown, and neither is chosen.
  - No second source available: **Single-source validated**.
- If a provider later revises an already-verified close, that close is marked Disputed rather than silently overwritten. Older observations never replace newer ones.
- Statuses: Verified, Single-source validated, Pending, Stale, Disputed.

## Scheduling

Updates run at **10:30 AM, 2:30 PM and 7:30 PM ET** on NYSE trading days (`.github/workflows/etf-update.yml`).

- GitHub cron uses UTC, so each slot is scheduled at both its EDT and EST UTC time. The job checks the New York clock and runs only inside a valid window. Duplicate firings are no-ops once a slot completes, and act as retries if it failed or GitHub delayed the run.
- Weekends and holidays are skipped. On early-close days (1:00 PM), the 2:30 PM update is skipped and the evening run records the official close.
- The evening run is authoritative: it syncs the official close, cross-checks it, recomputes analytics and evaluates alerts. Late-evening firings retry until the close is available.
- Missed runs can be recovered manually: `npm run job:update -- --slot evening --date 2026-10-16 --force`, or use *Run workflow* in GitHub Actions.
- The **Refresh now** button (rate-limited to once per minute) fetches current data on demand.

## Alerts

- A daily-drop alert fires when the daily change is strictly below `-threshold` (default 5%). Exactly −5.00% does not trigger. Values are compared at 6 decimal places, so floating-point noise cannot trigger an alert.
- Alerts are evaluated only during scheduled or manual updates, never by continuous polling.
- Only **Verified** data can trigger an alert, plus **Single-source validated** data if allowed in settings (on by default; turn it off to require a cross-check). Stale, pending and disputed data never trigger alerts.
- Each ETF alerts at most once per session (database unique constraint), whether the drop is first seen intraday or at the close.
- If several ETFs qualify in one run, they are combined into a single email, e.g. `ETF Alert: SOXX Down 6.2%, SMH Down 5.8% Today`. The email includes previous close, latest price, $/% change, 52W high and distance below it, observation time, intraday vs. close, verification status and a dashboard link.
- Failed sends retry with exponential backoff and are logged. A failed alert is retried on the next update without creating a duplicate alert.
- Optional target-price alerts (at or below / at or above) follow the same rules.

## Local setup

```bash
cd etf-dashboard
cp .env.example .env.local      # add TIINGO_API_KEY (+ MASSIVE_API_KEY, RESEND_API_KEY)
npm install
npm run job:backfill            # loads full daily history for all 12 ETFs into .data/pglite
npm run dev                     # http://localhost:3000
```

Other commands:

```bash
npm run job:update              # what the scheduler runs
npm run job:recompute           # rebuild analytics from stored data
npm run expense-ratio -- VOO 0.03 "https://investor.vanguard.com/..."   # record a verified expense ratio
npm test && npm run lint && npm run typecheck && npm run build
```

Expense ratios start as **reference** values from the brief and are labelled that way in the UI. Recording a value checked on the
fund provider's website marks it verified and keeps its history.

## Deployment (free tiers)

1. **Database**: create a free Postgres database (Neon or Supabase) and copy the connection string into `DATABASE_URL`.
2. **Web app**: deploy `etf-dashboard/` to Vercel (set *Root Directory* to `etf-dashboard`). Set `DATABASE_URL`, `TIINGO_API_KEY`, `MASSIVE_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `ALERT_EMAIL_TO`, `APP_URL`, and optionally `DASHBOARD_PASSWORD`. Any Node host works (`npm run build && npm start`).
3. **Scheduler**: in the GitHub repo, add the same values as **Actions secrets** (`DATABASE_URL`, `TIINGO_API_KEY`, `MASSIVE_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `ALERT_EMAIL_TO`) and an Actions variable `APP_URL`. The workflow runs on GitHub's servers, so updates and alerts continue when your computer is off. Note: GitHub disables scheduled workflows in repos with no activity for 60 days. Re-enable from the Actions tab if that happens.
4. **First load**: run `npm run job:backfill` once against the production `DATABASE_URL`, or trigger the workflow manually.
5. **Email**: with Resend, verify a sending domain, or use `onboarding@resend.dev` to send to your own address only. Alternatively, set `SMTP_URL` (e.g. a Gmail app password).
6. Open **Alert Settings** and click **Send test email**.

As an alternative to GitHub Actions, any scheduler can call `GET /api/cron` with `Authorization: Bearer $CRON_SECRET` at the same times.

## Tests

`npm test` (Vitest) covers:

- Calculations: daily change, returns, YTD, extremes, drawdowns and classes, moving averages, volatility, streaks, split adjustment.
- NYSE holidays, observance and early closes, DST conversion, scheduled-slot resolution.
- Price validation, stale quotes, split discontinuities, cross-check outcomes.
- Persistence: idempotent upserts, protecting verified closes, newest-wins observations.
- End-to-end update runs against embedded Postgres with fake providers: verified/disputed/single-source labelling, strict 5% threshold, combined emails, duplicate prevention across runs, disabled alerts, ticker selection, target alerts, intraday vs. stale data, delivery failure and retry.

## Limitations

- Intraday prices come from Tiingo's IEX feed (IEX-exchange trades only). Official consolidated closes come from end-of-day data, which is why the evening run is authoritative.
- The 1D chart is not a tick chart. Intraday data is limited to the three stored observations per day, and no points are interpolated.
- The daily analysis describes measured moves and uses hedged language. It does not attribute moves to news.

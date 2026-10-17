import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { alertsForSession } from "@/lib/alerts";
import type { Db } from "@/lib/db";
import { deliver } from "@/lib/email";
import { runUpdate } from "@/lib/jobs/update";
import { latestSnapshot, loadBars } from "@/lib/repo";
import { saveAlertSettings, defaultAlertSettings } from "@/lib/settings";
import { FakePrimary, FakeSecondary, FakeTransport, providers, testDb } from "./helpers";

const SESSION = "2026-10-16";
const EVENING = new Date("2026-10-16T23:30:00Z");

let db: Db;
let primary: FakePrimary;
let secondary: FakeSecondary;
let transport: FakeTransport;

beforeEach(async () => {
  db = await testDb();
  primary = new FakePrimary("2024-01-02", SESSION);
  secondary = new FakeSecondary(primary);
  transport = new FakeTransport();
  await saveAlertSettings(db, { ...defaultAlertSettings(), recipient: "me@example.com" });
});
afterEach(async () => {
  await db.close();
});

const evening = (extra: Partial<Parameters<typeof runUpdate>[0]> = {}) =>
  runUpdate({ db, providers: providers(primary, secondary), transport, trigger: "scheduled", now: EVENING, log: () => {}, ...extra });

describe("evening (official close) update", () => {
  it("backfills, verifies closes against the second source and persists a snapshot", async () => {
    const res = await evening();
    expect(res.status).toBe("success");
    expect(res.slot).toBe("evening");
    expect(Object.values(res.tickers!).every((t) => t.status === "verified")).toBe(true);
    const bars = await loadBars(db, ["VOO"]);
    expect(bars.get("VOO")!.at(-1)!.verificationStatus).toBe("verified");
    const snap = await latestSnapshot(db);
    expect(snap?.sessionDate).toBe(SESSION);
    expect(snap?.basis).toBe("final-close");
    const voo = snap!.etfs.find((e) => e.ticker === "VOO")!;
    expect(voo.price).toBe(primary.lastClose("VOO"));
    expect(voo.prevCloseDate).toBe("2026-10-15");
    expect(voo.priceReturns["1Y"]).not.toBeNull();
    expect(voo.priceReturns["5Y"]).toBeNull(); // insufficient history -> not shown
  });

  it("marks material disagreements as disputed and keeps both values", async () => {
    secondary.overrides.set("SMH", primary.lastClose("SMH") * 1.02);
    const res = await evening();
    expect(res.tickers!.SMH.status).toBe("disputed");
    expect(res.status).toBe("partial");
    const smh = (await loadBars(db, ["SMH"])).get("SMH")!.at(-1)!;
    expect(smh.verificationStatus).toBe("disputed");
    expect(smh.verificationClose).toBeCloseTo(primary.lastClose("SMH") * 1.02, 4);
  });

  it("is single-source validated when the second source has no data", async () => {
    secondary.overrides.set("VOO", null);
    const res = await evening();
    expect(res.tickers!.VOO.status).toBe("single_source");
  });

  it("skips weekends and an already-completed slot", async () => {
    const weekend = await evening({ now: new Date("2026-10-17T23:30:00Z") });
    expect(weekend.status).toBe("skipped");
    await evening();
    const again = await evening();
    expect(again.status).toBe("skipped");
  });
});

describe("alerts", () => {
  it("emails once for a verified decline greater than 5%", async () => {
    primary.setLastMove("SOXX", -6.2);
    const res = await evening();
    expect(res.alerts!.created.map((a) => a.ticker)).toEqual(["SOXX"]);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].subject).toBe("ETF Alert: SOXX Down 6.2% Today");
    expect(transport.sent[0].text).toContain("Verification status: Verified");
    expect(transport.sent[0].text).toContain("At the official close");
  });

  it("does not alert at exactly -5.00%", async () => {
    // prev close chosen so the -5% move is exact in cents
    const bars = primary.history.get("VOO")!;
    bars[bars.length - 2] = { ...bars[bars.length - 2], close: 100, adjClose: 100, high: 100.5, low: 99.5 };
    bars[bars.length - 1] = { ...bars[bars.length - 1], close: 95, adjClose: 95, open: 95, high: 95, low: 95 };
    const res = await evening();
    expect(res.alerts!.created).toHaveLength(0);
    expect(transport.sent).toHaveLength(0);
  });

  it("combines multiple ETFs into one email", async () => {
    primary.setLastMove("SOXX", -7);
    primary.setLastMove("SMH", -6);
    primary.setLastMove("SOXQ", -6.5);
    await evening();
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].subject).toBe("ETF Alert: SOXX Down 7.0%, SOXQ Down 6.5%, SMH Down 6.0% Today");
  });

  it("never alerts on disputed data", async () => {
    primary.setLastMove("SMH", -8);
    secondary.overrides.set("SMH", primary.lastClose("SMH") * 1.05);
    const res = await evening();
    expect(res.tickers!.SMH.status).toBe("disputed");
    expect(transport.sent).toHaveLength(0);
  });

  it("respects the single-source setting", async () => {
    primary.setLastMove("VGT", -6);
    secondary.overrides.set("VGT", null);
    await saveAlertSettings(db, { ...defaultAlertSettings(), recipient: "me@example.com", allowSingleSource: false });
    await evening();
    expect(transport.sent).toHaveLength(0);
  });

  it("does not send duplicates for the same ETF and session on later runs", async () => {
    primary.setLastMove("SOXX", -6.2);
    await evening();
    await evening({ force: true });
    await evening({ trigger: "manual" });
    expect(transport.sent).toHaveLength(1);
    expect(await alertsForSession(db, SESSION)).toHaveLength(1);
  });

  it("records failed delivery and retries on the next run without duplicating the alert", async () => {
    primary.setLastMove("SOXX", -6.2);
    transport.failures = 1;
    const first = await evening();
    expect(first.alerts!.emailError).toContain("simulated outage");
    expect((await alertsForSession(db, SESSION))[0].email_status).toBe("failed");
    const deliveries = await db.query<{ status: string }>("SELECT status FROM email_deliveries");
    expect(deliveries.map((d) => d.status)).toEqual(["failed"]);

    await evening({ force: true });
    expect(transport.sent).toHaveLength(1);
    const alerts = await alertsForSession(db, SESSION);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].email_status).toBe("sent");
  });

  it("records alerts but sends nothing when alerts are disabled", async () => {
    primary.setLastMove("SOXX", -6.2);
    await saveAlertSettings(db, { ...defaultAlertSettings(), recipient: "me@example.com", enabled: false });
    const res = await evening();
    expect(res.alerts!.created).toHaveLength(1);
    expect(transport.sent).toHaveLength(0);
  });

  it("only evaluates selected ETFs", async () => {
    primary.setLastMove("SOXX", -6.2);
    await saveAlertSettings(db, { ...defaultAlertSettings(), recipient: "me@example.com", tickers: ["VOO"] });
    await evening();
    expect(transport.sent).toHaveLength(0);
  });

  it("fires target-price alerts once per session", async () => {
    const price = primary.lastClose("VOO");
    await db.query("INSERT INTO target_price_alerts (ticker, direction, target_price) VALUES ('VOO', 'below', $1)", [price + 1]);
    await evening();
    await evening({ force: true });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].subject).toContain("VOO at/below target");
  });
});

describe("intraday update", () => {
  it("uses fresh intraday quotes and evaluates alerts on validated intraday data", async () => {
    await evening({ now: new Date("2026-10-15T23:30:00Z") }); // store the 10/15 close
    const prev = primary.history.get("SOXX")!.find((b) => b.date === "2026-10-15")!.close;
    for (const [t, bars] of primary.history) {
      const pc = bars.find((b) => b.date === "2026-10-15")!.close;
      const price = t === "SOXX" ? Math.round(prev * 0.93 * 100) / 100 : pc;
      primary.quotes.set(t, { ticker: t, source: "FakeIEX", candidates: [{ price, field: "last", timestamp: "2026-10-16T14:29:00Z" }], prevClose: pc, isDelayed: false });
    }
    const res = await runUpdate({ db, providers: providers(primary, secondary), transport, trigger: "scheduled", now: new Date("2026-10-16T14:30:00Z"), log: () => {} });
    expect(res.slot).toBe("morning");
    expect(res.mode).toBe("intraday");
    expect(res.tickers!.SOXX.status).toBe("single_source");
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].text).toContain("Intraday (morning update)");
  });

  it("marks stale quotes and does not alert on them", async () => {
    await evening({ now: new Date("2026-10-15T23:30:00Z") });
    for (const [t, bars] of primary.history) {
      const pc = bars.find((b) => b.date === "2026-10-15")!.close;
      primary.quotes.set(t, { ticker: t, source: "FakeIEX", candidates: [{ price: pc * 0.9, field: "last", timestamp: "2026-10-15T19:59:00Z" }], prevClose: pc, isDelayed: false });
    }
    const res = await runUpdate({ db, providers: providers(primary, secondary), transport, trigger: "scheduled", now: new Date("2026-10-16T14:30:00Z"), log: () => {} });
    expect(res.tickers!.VOO.status).toBe("stale");
    expect(transport.sent).toHaveLength(0);
  });
});

describe("email delivery", () => {
  it("retries transient failures with backoff and records attempts", async () => {
    transport.failures = 2;
    transport.retryable = true;
    const r = await deliver(db, transport, { to: "a@b.c", subject: "s", text: "t", html: "h" }, "test", { maxAttempts: 3, baseDelayMs: 1 });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(3);
  });
  it("gives up after max attempts and logs the error", async () => {
    transport.failures = 5;
    transport.retryable = true;
    const r = await deliver(db, transport, { to: "a@b.c", subject: "s", text: "t", html: "h" }, "test", { maxAttempts: 2, baseDelayMs: 1 });
    expect(r.ok).toBe(false);
    const [row] = await db.query<{ status: string; attempts: number; error: string }>("SELECT status, attempts, error FROM email_deliveries");
    expect(row).toMatchObject({ status: "failed", attempts: 2, error: "simulated outage" });
  });
  it("fails cleanly when no provider is configured", async () => {
    const r = await deliver(db, null, { to: "a@b.c", subject: "s", text: "t", html: "h" }, "test");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("No email provider");
  });
});

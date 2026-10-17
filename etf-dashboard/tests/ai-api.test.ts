import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Db } from "@/lib/db";
import { testDb } from "./helpers";
let db: Db;
const mocks = vi.hoisted(() => ({ context: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/db", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/db")>(), getDb: async () => db }));
vi.mock("@/lib/ai/context", () => ({ analysisContext: mocks.context }));
vi.mock("@/lib/ai/nvidia", () => ({ DEFAULT_MODEL: "test-model", generateReport: mocks.generate }));
import { POST } from "@/app/api/ai-analysis/route";
const request = (profile = "balanced", origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/ai-analysis", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ profile }) });
beforeEach(async () => {
  db = await testDb();
  vi.stubEnv("NVIDIA_API_KEY", "test-secret");
  mocks.context.mockReset().mockResolvedValue({ snapshot: { computedAt: "now", etfs: [] }, ranking: { session: "2026-10-16", picks: ["VOO", "VTI", "SCHG", "VUG", "VXUS"].map(ticker => ({ etf: { ticker } })) } });
  mocks.generate.mockReset().mockResolvedValue({ overview: "test" });
});
afterEach(async () => { await db.close(); vi.unstubAllEnvs(); });
it("rejects cross-origin requests and invalid profiles before inference", async () => {
  expect((await POST(request("balanced", "https://other.example"))).status).toBe(403);
  expect((await POST(request("unknown"))).status).toBe(400);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("reports missing configuration and insufficient candidates", async () => {
  vi.stubEnv("NVIDIA_API_KEY", "");
  expect((await POST(request())).status).toBe(503);
  vi.stubEnv("NVIDIA_API_KEY", "test-secret");
  mocks.context.mockResolvedValue({ ranking: { picks: [], session: "2026-10-16" } });
  expect((await POST(request())).status).toBe(422);
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("caches unchanged evidence and applies a database cooldown to changed profiles", async () => {
  expect((await POST(request())).status).toBe(200);
  const cached = await POST(request());
  expect((await cached.json()).cached).toBe(true);
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect((await POST(request("growth"))).status).toBe(429);
});
it("does not store failed inference as a report", async () => {
  mocks.generate.mockRejectedValue(new Error("NVIDIA request failed (503). Try again later."));
  expect((await POST(request())).status).toBe(502);
  expect(await db.query("SELECT key FROM settings WHERE key LIKE 'ai-report:%'")).toHaveLength(0);
});

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deliver, transportFromEnv } from "@/lib/email";
import { appUrl } from "@/lib/config";
import { getAlertSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST() {
  const db = await getDb();
  const settings = await getAlertSettings(db);
  if (!settings.recipient) return NextResponse.json({ error: "Set a recipient email first." }, { status: 400 });
  const res = await deliver(
    db,
    transportFromEnv(),
    {
      to: settings.recipient,
      subject: "ETF Alert: Test email",
      text: `This is a test email from your ETF dashboard (${appUrl()}). No market alert was triggered.`,
      html: `<p>This is a test email from your <a href="${appUrl()}">ETF dashboard</a>. No market alert was triggered.</p>`,
    },
    "test",
    { maxAttempts: 2, baseDelayMs: 1000 },
  );
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}

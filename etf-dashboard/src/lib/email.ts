import type { Db } from "./db";
import { sleep } from "./providers/http";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
}

export interface EmailTransport {
  name: string;
  send(msg: EmailMessage): Promise<{ id: string | null }>;
}

export class EmailError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
  }
}

export class ResendTransport implements EmailTransport {
  name = "Resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}
  async send(msg: EmailMessage) {
    let res: Response;
    try {
      res = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(msg.idempotencyKey ? { "Idempotency-Key": msg.idempotencyKey } : {}),
        },
        body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      });
    } catch (e) {
      throw new EmailError(`Network error contacting Resend: ${(e as Error).message}`, true);
    }
    const body = await res.text();
    if (!res.ok) {
      throw new EmailError(`Resend HTTP ${res.status}: ${body.slice(0, 300)}`, res.status === 429 || res.status >= 500);
    }
    try {
      return { id: (JSON.parse(body) as { id?: string }).id ?? null };
    } catch {
      return { id: null };
    }
  }
}

export class SmtpTransport implements EmailTransport {
  name = "SMTP";
  constructor(private readonly url: string, private readonly from: string) {}
  async send(msg: EmailMessage) {
    const nodemailer = await import("nodemailer");
    const t = nodemailer.createTransport(this.url);
    try {
      const info = await t.sendMail({ from: this.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
      return { id: info.messageId ?? null };
    } catch (e) {
      const code = (e as { responseCode?: number }).responseCode;
      // SMTP 4xx replies are transient; 5xx are permanent. No code → network error.
      throw new EmailError(`SMTP error: ${(e as Error).message}`, !code || (code >= 400 && code < 500));
    }
  }
}

export function transportFromEnv(env: NodeJS.ProcessEnv = process.env): EmailTransport | null {
  const from = env.EMAIL_FROM || "ETF Alerts <onboarding@resend.dev>";
  if (env.RESEND_API_KEY) return new ResendTransport(env.RESEND_API_KEY, from);
  if (env.SMTP_URL) return new SmtpTransport(env.SMTP_URL, from);
  return null;
}

export interface DeliveryResult {
  ok: boolean;
  deliveryId: number;
  attempts: number;
  error: string | null;
}

/** Send with retries (exponential backoff) and record the outcome in email_deliveries. */
export async function deliver(
  db: Pick<Db, "query">,
  transport: EmailTransport | null,
  msg: EmailMessage,
  kind: "alert" | "test",
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<DeliveryResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelay = opts.baseDelayMs ?? 2000;
  const [row] = await db.query<{ id: number }>(
    "INSERT INTO email_deliveries (kind, recipient, subject, provider, status) VALUES ($1, $2, $3, $4, 'sending') RETURNING id",
    [kind, msg.to, msg.subject, transport?.name ?? "none"],
  );
  if (!transport) {
    const error = "No email provider configured (set RESEND_API_KEY or SMTP_URL).";
    await db.query("UPDATE email_deliveries SET status = 'failed', error = $2 WHERE id = $1", [row.id, error]);
    return { ok: false, deliveryId: row.id, attempts: 0, error };
  }
  let attempts = 0;
  let lastError = "";
  while (attempts < maxAttempts) {
    attempts++;
    try {
      const { id } = await transport.send(msg);
      await db.query(
        "UPDATE email_deliveries SET status = 'sent', attempts = $2, provider_message_id = $3, sent_at = now(), error = NULL WHERE id = $1",
        [row.id, attempts, id],
      );
      return { ok: true, deliveryId: row.id, attempts, error: null };
    } catch (e) {
      lastError = (e as Error).message;
      console.error(`[email] attempt ${attempts}/${maxAttempts} failed: ${lastError}`);
      const retryable = e instanceof EmailError ? e.retryable : true;
      if (!retryable) break;
      if (attempts < maxAttempts) await sleep(baseDelay * 2 ** (attempts - 1));
    }
  }
  await db.query("UPDATE email_deliveries SET status = 'failed', attempts = $2, error = $3 WHERE id = $1", [row.id, attempts, lastError]);
  return { ok: false, deliveryId: row.id, attempts, error: lastError };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

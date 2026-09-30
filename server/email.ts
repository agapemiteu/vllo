import { CASE } from "./caseStore.js";
import type { RoomId } from "./types.js";

type Result = { ok: true } | { ok: false; status: number; reason: "not_configured" | "recipient_not_allowed" | "provider_error"; error: string };

const safe = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/**
 * Emails the PDF report through Brevo (free plan, 300 a day, any recipient once the sender is verified).
 * Needs BREVO_API_KEY and REPORT_FROM_EMAIL. Any failure is reported so the page falls back to download.
 */
export async function sendReportEmail(to: string, room: RoomId, pdf: Buffer): Promise<Result> {
  const key = process.env.BREVO_API_KEY;
  const from = process.env.REPORT_FROM_EMAIL;
  if (!key || !from) {
    return { ok: false, status: 503, reason: "not_configured", error: "Email is not set up on this server, so the report was downloaded instead." };
  }
  const person = CASE.interviewees.find((p: any) => p.id === room);
  const name = String(person?.name ?? "the interview");

  let res: Response;
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        sender: { email: from, name: "vllo" },
        to: [{ email: to }],
        subject: `vllo interview report: ${name}`,
        htmlContent: `<p>Your vllo interview report for <b>${safe(name)}</b> (${safe(String(CASE.title))}) is attached as a PDF.</p><p style="color:#78716c">vllo reports contradictions between statements and evidence. It does not assess truthfulness, emotion or guilt.</p>`,
        attachment: [{ name: `vllo-report-${name.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`, content: pdf.toString("base64") }],
      }),
    });
  } catch (e: any) {
    console.error("brevo unreachable", e?.message);
    return { ok: false, status: 502, reason: "provider_error", error: "The email service couldn't be reached, so the report was downloaded instead." };
  }
  if (res.ok) return { ok: true };
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  console.error("brevo send failed", res.status, detail);
  if (res.status === 401 || res.status === 403 || /sender|unauthori[sz]ed|not valid/i.test(detail)) {
    return { ok: false, status: 403, reason: "recipient_not_allowed", error: "The email service refused the message, so the report was downloaded instead." };
  }
  return { ok: false, status: 502, reason: "provider_error", error: "The email service didn't accept the message, so the report was downloaded instead." };
}

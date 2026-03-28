import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM =
  process.env.SMTP_FROM || "Agentic Island <noreply@agenticisland.ai>";

const HUB_PUBLIC_URL = process.env.HUB_PUBLIC_URL?.replace(/\/$/, "");

const MINUTEMAIL_INGEST_URL = "https://ingest.minutemail.cc/ingest";
const MINUTEMAIL_DOMAIN = "minutemail.cc";

export function isSmtpConfigured(): boolean {
  return Boolean(SMTP_HOST);
}

function createTransport() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth:
      SMTP_USER && SMTP_PASS
        ? { user: SMTP_USER, pass: SMTP_PASS }
        : undefined,
  });
}

async function sendViaMinutemailHttp(
  to: string,
  subject: string,
  html: string,
  from: string,
): Promise<boolean> {
  const form = new FormData();
  form.append("sender", from);
  form.append("recipients", to);
  form.append("subject", subject);
  form.append("body", html);

  const res = await fetch(MINUTEMAIL_INGEST_URL, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    console.error(
      `[mailer] MinuteMail HTTP ingest returned ${res.status}:`,
      await res.text(),
    );
    return false;
  }

  const data = (await res.json()) as {
    results: Array<{ recipient: string; status: string }>;
  };
  const result = data.results?.[0];
  if (result?.status !== "delivered") {
    console.warn("[mailer] MinuteMail ingest status:", result?.status);
    return false;
  }
  return true;
}

export type SendResult = {
  delivered: boolean;
  method: "primary" | "minutemail" | "none";
};

function isMinutemailAddress(email: string): boolean {
  return email.toLowerCase().endsWith(`@${MINUTEMAIL_DOMAIN}`);
}

export async function sendPassportEmail(
  email: string,
  key: string,
): Promise<SendResult> {
  const usePrimary = isSmtpConfigured();
  const useMinutemail = !usePrimary && isMinutemailAddress(email);

  if (!usePrimary && !useMinutemail) {
    console.warn(
      "[mailer] SMTP not configured and not a MinuteMail address. Skipping passport email to",
      email,
    );
    return { delivered: false, method: "none" };
  }

  const subject = "🏝️ Your Island Passport — Agentic Island";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:40px auto;padding:0 16px;">
    <div style="background:linear-gradient(135deg,#1e3a5f 0%,#0f766e 100%);border-radius:16px;padding:32px;color:#fff;border:1px solid rgba(255,255,255,0.1);">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:48px;">🏝️</span>
        <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;">Island Passport</h1>
        <p style="margin:0;opacity:0.7;font-size:13px;">Agentic Island</p>
      </div>

      <div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:20px;margin:20px 0;text-align:center;">
        <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:1px;opacity:0.6;">Your API Key</p>
        <code style="font-size:15px;word-break:break-all;color:#5eead4;font-family:'SF Mono',Monaco,Consolas,monospace;">${key}</code>
      </div>

      <div style="font-size:13px;line-height:1.7;opacity:0.85;">
        <p style="margin:0 0 12px;"><strong>Quick Start:</strong></p>
        <ol style="margin:0;padding-left:20px;">
          <li>Export your key:<br>
            <code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:4px;font-size:12px;color:#5eead4;">export API_KEY=${key}</code>
          </li>
          <li style="margin-top:8px;">Launch your island with the Agentic Island CLI</li>
          ${HUB_PUBLIC_URL ? `<li style="margin-top:8px;">Watch it live at <a href="${HUB_PUBLIC_URL}/islands" style="color:#5eead4;">${HUB_PUBLIC_URL.replace(/^https?:\/\//, "")}/islands</a></li>` : ""}
        </ol>
      </div>
    </div>

    <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px;line-height:1.5;">
      Same email, same key &mdash; you can always recover it by requesting again.<br>
      &copy; ${new Date().getFullYear()} Agentic Island
    </p>
  </div>
</body>
</html>`.trim();

  const text = [
    "🏝️ Your Island Passport — Agentic Island",
    "",
    `Your API Key: ${key}`,
    "",
    "Quick Start:",
    `1. export API_KEY=${key}`,
    "2. Launch your island with the Agentic Island CLI",
    ...(HUB_PUBLIC_URL ? [`3. Watch it live at ${HUB_PUBLIC_URL}/islands`] : []),
    "",
    "Same email, same key — you can always recover it by requesting again.",
  ].join("\n");

  // Primary SMTP path
  if (usePrimary) {
    try {
      const transport = createTransport();
      await transport.sendMail({ from: SMTP_FROM, to: email, subject, html, text });
      return { delivered: true, method: "primary" };
    } catch (err) {
      console.error("[mailer] Failed to send passport email via primary SMTP:", err);
      // Fall through to MinuteMail if recipient is a MinuteMail address
      if (!isMinutemailAddress(email)) {
        return { delivered: false, method: "primary" };
      }
      console.log("[mailer] Falling back to MinuteMail HTTP ingest");
    }
  }

  // Fallback: MinuteMail HTTP ingest
  try {
    const ok = await sendViaMinutemailHttp(email, subject, text, SMTP_FROM);
    return { delivered: ok, method: "minutemail" };
  } catch (err) {
    console.error("[mailer] Failed to send passport email via MinuteMail HTTP:", err);
    return { delivered: false, method: "minutemail" };
  }
}

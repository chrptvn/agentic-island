import { Hono } from "hono";
import { createHash, randomUUID } from "node:crypto";
import db from "../db/index.js";
import { sendHubKeyEmail, isSmtpConfigured } from "../services/mailer.js";
import { generateHubKey } from "../lib/hub-key.js";
import { isValidEmail } from "../lib/validation.js";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

const keys = new Hono();

keys.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = (body as { email?: string }).email;

  if (!email || typeof email !== "string" || !isValidEmail(email)) {
    return c.json({ error: "A valid email address is required." }, 400);
  }

  const normalized = email.toLowerCase().trim();
  const rawKey = generateHubKey(normalized);
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const existing = db
    .prepare("SELECT id FROM api_keys WHERE email = ?")
    .get(normalized) as { id: string } | undefined;

  if (!existing) {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO api_keys (id, key_hash, email) VALUES (?, ?, ?)",
    ).run(id, keyHash, normalized);
  }

  const result = await sendHubKeyEmail(normalized, rawKey);

  return c.json(
    {
      sent: result.delivered,
      maskedEmail: maskEmail(normalized),
      smtpConfigured: isSmtpConfigured(),
    },
    existing ? 200 : 201,
  );
});

export default keys;

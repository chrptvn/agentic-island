import { Hono } from "hono";
import { createHash, randomUUID } from "node:crypto";
import db from "../db/index.js";
import { sendPassportEmail, isSmtpConfigured } from "../services/mailer.js";

const PASSPORT_SALT =
  process.env.PASSPORT_SALT || "agentic-island-default-salt-2025";

function generatePassportKey(email: string): string {
  const normalized = email.toLowerCase().trim();
  const hash = createHash("sha256")
    .update(normalized + PASSPORT_SALT)
    .digest("hex");
  return `ai_${hash.substring(0, 32)}`;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

const keys = new Hono();

keys.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = (body as { email?: string }).email;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return c.json({ error: "A valid email address is required." }, 400);
  }

  const normalized = email.toLowerCase().trim();
  const rawKey = generatePassportKey(normalized);
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

  const result = await sendPassportEmail(normalized, rawKey);

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

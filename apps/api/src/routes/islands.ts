import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import db from "../db/index.js";
import type { HubToIslandMessage, IslandPassportResponse } from "@agentic-island/shared";
import { sendPassportEmail, isSmtpConfigured } from "../services/mailer.js";
import { sendPassportRequest, lastMapInit, lastInitialState } from "../ws/island-handler.js";
import { isValidEmail } from "../lib/validation.js";

const islands = new Hono();

interface IslandRow {
  id: string;
  name: string;
  description: string | null;
  thumbnail_path: string | null;
  player_count: number;
  status: string;
  last_heartbeat_at: string | null;
  created_at: string;
}

function toCamelCase(row: IslandRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    thumbnailUrl: row.thumbnail_path ?? undefined,
    playerCount: row.player_count,
    status: row.status,
    lastHeartbeatAt: row.last_heartbeat_at,
    createdAt: row.created_at,
  };
}

islands.get("/", (c) => {
  const filter = c.req.query("filter");
  const cols =
    "id, name, description, thumbnail_path, player_count, status, last_heartbeat_at, created_at";

  let rows: IslandRow[];
  if (filter === "with-agents") {
    rows = db
      .prepare(
        `SELECT ${cols} FROM islands WHERE status = 'online' AND player_count > 0 ORDER BY updated_at DESC`,
      )
      .all() as IslandRow[];
  } else {
    rows = db
      .prepare(`SELECT ${cols} FROM islands WHERE status = 'online' ORDER BY updated_at DESC`)
      .all() as IslandRow[];
  }

  return c.json({ islands: rows.map(toCamelCase) });
});

/** Serve the static map data — never cached by clients. */
islands.get("/:id/map", (c) => {
  const id = c.req.param("id");
  const cached = lastMapInit.get(id);
  if (!cached) return c.json({ error: "Island map not available" }, 404);

  return c.body(cached, 200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
});

/** Serve the dynamic initial state (entities, characters, overrides, tick). */
islands.get("/:id/state", (c) => {
  const id = c.req.param("id");
  const cached = lastInitialState.get(id);
  if (!cached) return c.json({ error: "Island state not available" }, 404);

  return c.body(cached, 200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
});

islands.get("/:id", (c) => {
  const id = c.req.param("id");
  const row = db.prepare(
    "SELECT id, name, description, thumbnail_path, player_count, status, last_heartbeat_at, created_at FROM islands WHERE id = ?"
  ).get(id) as IslandRow | undefined;
  if (!row) return c.json({ error: "Island not found" }, 404);

  db.prepare("INSERT INTO island_views (island_id) VALUES (?)").run(id);

  return c.json(toCamelCase(row));
});

/** Get the character catalog from an island (tunneled request). */
islands.get("/:id/passport-catalog", async (c) => {
  const id = c.req.param("id");
  const requestId = randomUUID();
  const request: HubToIslandMessage = {
    type: "passport_request",
    requestId,
    action: "get_catalog",
  };

  try {
    const response = await sendPassportRequest(id, request, requestId) as IslandPassportResponse;
    if (!response.success) {
      return c.json({ error: response.error ?? "Failed to get catalog" }, 500);
    }
    return c.json({ catalog: response.catalog });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: msg }, 503);
  }
});

/** Check if SMTP is configured (so frontend knows whether to offer minutemail). */
islands.get("/:id/smtp-status", (c) => {
  return c.json({ smtpConfigured: isSmtpConfigured() });
});

/** Create or recover a passport for an island. */
islands.post("/:id/passports", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { email, name, appearance } = body as { email?: string; name?: string; appearance?: Record<string, unknown> };
  if (!email || typeof email !== "string" || !isValidEmail(email)) {
    return c.json({ error: "A valid email address is required" }, 400);
  }
  if (!name || typeof name !== "string" || name.trim().length < 1 || name.trim().length > 50) {
    return c.json({ error: "Name is required (1–50 characters)" }, 400);
  }
  if (!appearance || typeof appearance !== "object" || Array.isArray(appearance)) {
    return c.json({ error: "Appearance is required" }, 400);
  }
  // Validate appearance shape: must be Record<string, string> with bounded values
  for (const [k, v] of Object.entries(appearance)) {
    if (typeof k !== "string" || k.length > 64 || typeof v !== "string" || v.length > 128) {
      return c.json({ error: "Invalid appearance data" }, 400);
    }
  }
  if (Object.keys(appearance).length > 20) {
    return c.json({ error: "Too many appearance fields" }, 400);
  }

  const requestId = randomUUID();
  const request: HubToIslandMessage = {
    type: "passport_request",
    requestId,
    action: "create",
    email: email.trim().toLowerCase(),
    name: name.trim(),
    appearance: appearance as import("@agentic-island/shared").CharacterAppearance,
  };

  try {
    const response = await sendPassportRequest(id, request, requestId) as IslandPassportResponse;
    if (!response.success) {
      return c.json({ error: response.error ?? "Failed to create passport" }, 400);
    }

    // Send the passport key by email
    const mcpUrl = `${process.env.HUB_PUBLIC_URL?.replace(/\/$/, "") ?? ""}/islands/${id}/mcp`;
    const result = await sendPassportEmail(email.trim().toLowerCase(), response.rawKey!, mcpUrl, name.trim());

    return c.json({
      sent: result.delivered,
      method: result.method,
      maskedEmail: response.maskedEmail,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: msg }, 503);
  }
});

/** Update passport appearance. */
islands.put("/:id/passports", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { email, appearance } = body as { email?: string; appearance?: Record<string, unknown> };
  if (!email || typeof email !== "string" || !isValidEmail(email)) {
    return c.json({ error: "A valid email address is required" }, 400);
  }
  if (!appearance || typeof appearance !== "object" || Array.isArray(appearance)) {
    return c.json({ error: "Appearance is required" }, 400);
  }
  for (const [k, v] of Object.entries(appearance)) {
    if (typeof k !== "string" || k.length > 64 || typeof v !== "string" || v.length > 128) {
      return c.json({ error: "Invalid appearance data" }, 400);
    }
  }
  if (Object.keys(appearance).length > 20) {
    return c.json({ error: "Too many appearance fields" }, 400);
  }

  const requestId = randomUUID();
  const request: HubToIslandMessage = {
    type: "passport_request",
    requestId,
    action: "update",
    email: email.trim().toLowerCase(),
    appearance: appearance as import("@agentic-island/shared").CharacterAppearance,
  };

  try {
    const response = await sendPassportRequest(id, request, requestId) as IslandPassportResponse;
    if (!response.success) {
      return c.json({ error: response.error ?? "Failed to update passport" }, 400);
    }
    return c.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: msg }, 503);
  }
});

export default islands;

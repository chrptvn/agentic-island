import { spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import WebSocket from "ws";

const PORT = 14567;
const BASE = `http://localhost:${PORT}`;
const DB_PATH = "test-hub.db";
const SPRITE_DIR = "test-sprite-cache";

let server: ChildProcess | null = null;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function startHub(): Promise<void> {
  server = spawn("pnpm", ["exec", "tsx", "src/index.ts"], {
    cwd: "apps/hub-api",
    env: {
      ...process.env,
      HUB_PORT: String(PORT),
      HUB_DB_PATH: DB_PATH,
      SPRITE_CACHE_DIR: SPRITE_DIR,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) console.error(`  [hub stderr] ${text}`);
  });

  server.on("error", (err) => {
    console.error("  [hub] failed to start:", err.message);
  });
}

async function waitForReady(url: string, maxMs: number): Promise<void> {
  console.log(`  ⏳ Waiting for hub-api on port ${PORT}...`);
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log("  ✓ Hub-api is ready\n");
        return;
      }
    } catch {
      // server not ready yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Hub-api did not become ready within ${maxMs}ms`);
}

async function testHealth(): Promise<void> {
  console.log("  [1/4] GET /api/health");
  const res = await fetch(`${BASE}/api/health`);
  assert(res.ok, `expected 200, got ${res.status}`);
  const body = (await res.json()) as { status: string; uptime: number };
  assert(body.status === "ok", `expected status "ok", got "${body.status}"`);
  assert(typeof body.uptime === "number", "expected uptime to be a number");
  console.log("        ✓ status=ok, uptime present");
}

async function testKeyGeneration(): Promise<void> {
  console.log("  [2/4] POST /api/keys");
  const res = await fetch(`${BASE}/api/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: "smoke-test" }),
  });
  assert(res.status === 201, `expected 201, got ${res.status}`);
  const body = (await res.json()) as { id: string; key: string };
  assert(typeof body.id === "string" && body.id.length > 0, "expected non-empty id");
  assert(body.key.startsWith("ai_"), `expected key starting with "ai_", got "${body.key.slice(0, 10)}..."`);
  console.log(`        ✓ id=${body.id.slice(0, 8)}…, key=ai_***`);
}

async function testWorldList(): Promise<void> {
  console.log("  [3/4] GET /api/worlds");
  const res = await fetch(`${BASE}/api/worlds`);
  assert(res.ok, `expected 200, got ${res.status}`);
  const body = (await res.json()) as { worlds: unknown[] };
  assert(Array.isArray(body.worlds), "expected worlds to be an array");
  assert(body.worlds.length === 0, `expected empty worlds, got ${body.worlds.length}`);
  console.log("        ✓ worlds=[] (empty)");
}

async function testViewerWebSocket(): Promise<void> {
  console.log("  [4/4] WebSocket /ws/viewer");
  const ws = new WebSocket(`ws://localhost:${PORT}/ws/viewer`);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket did not open within 5s"));
    }, 5_000);

    ws.on("open", () => {
      clearTimeout(timeout);
      console.log("        ✓ connection opened");

      // Send a subscribe message and verify no crash
      ws.send(JSON.stringify({ type: "subscribe", worldId: "test-world" }));

      // Give the server a moment to process, then close cleanly
      setTimeout(() => {
        ws.close();
      }, 200);
    });

    ws.on("close", () => {
      console.log("        ✓ subscribe processed, closed cleanly");
      resolve();
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${err.message}`));
    });
  });
}

async function cleanup(): Promise<void> {
  if (server && server.pid && !server.killed) {
    try {
      process.kill(server.pid, "SIGTERM");
    } catch {
      // already dead
    }
  }

  // Give the process a moment to exit
  await new Promise((r) => setTimeout(r, 300));

  // Clean up test artifacts
  await rm(DB_PATH, { force: true });
  await rm(SPRITE_DIR, { recursive: true, force: true });
  console.log("\n  🧹 Cleaned up test artifacts");
}

async function main(): Promise<void> {
  console.log("🧪 Agentic Island — Smoke Test\n");
  try {
    await startHub();
    await waitForReady(`${BASE}/api/health`, 10_000);
    await testHealth();
    await testKeyGeneration();
    await testWorldList();
    await testViewerWebSocket();
    console.log("\n✅ All smoke tests passed!");
  } catch (err) {
    console.error("\n❌ Test failed:", err);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

main();

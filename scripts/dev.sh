#!/usr/bin/env bash
# scripts/dev.sh — Start all Agentic Island services for local development.
#
# Usage:
#   ./scripts/dev.sh             # api + web + island
#   ./scripts/dev.sh --no-world  # api + web only
#
# Requires: pnpm
# Services:
#   api    → http://localhost:3001
#   web    → http://localhost:3000 (Next.js, proxies /api + /ws to api)
#   island → http://localhost:3002
#
# Environment variables:
#   API_KEY   API key for the world to authenticate with api
#   ADMIN_KEY     Master admin key for island-cli admin commands
#   ISLAND_NAME    Name of the island (used by island)

set -euo pipefail
cd "$(dirname "$0")/.."

# ── Colors ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

PIDS=()

cleanup() {
  echo -e "\n${YELLOW}Shutting down…${NC}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null
  echo -e "${GREEN}All services stopped.${NC}"
}
trap cleanup EXIT INT TERM

prefix() {
  local color="$1" label="$2"
  sed -u "s/^/${color}[${label}]${NC} /"
}

# ── Build shared packages first ──────────────────────────────────────
echo -e "${BLUE}Building shared packages…${NC}"
pnpm --filter @agentic-island/shared run build 2>&1 | prefix "$BLUE" "build"
pnpm --filter @agentic-island/game-renderer run build 2>&1 | prefix "$BLUE" "build"
echo -e "${GREEN}Packages built.${NC}"

# ── Start api ────────────────────────────────────────────────────
echo -e "${GREEN}Starting api…${NC}"
pnpm --filter @agentic-island/api run dev 2>&1 | prefix "$GREEN" "api" &
PIDS+=($!)
sleep 1

# ── Start web (Next.js) ─────────────────────────────────────────────
echo -e "${BLUE}Starting web…${NC}"
pnpm --filter @agentic-island/web run dev 2>&1 | prefix "$BLUE" "web" &
PIDS+=($!)

# ── Start world (unless --no-world) ─────────────────────────────────
if [[ "${1:-}" != "--no-world" ]]; then
  sleep 1
  echo -e "${RED}Starting world…${NC}"
  ISLAND_PORT=3002 pnpm --filter @agentic-island/island run dev 2>&1 | prefix "$RED" "island" &
  PIDS+=($!)
fi

echo -e "\n${YELLOW}All services running. Press Ctrl+C to stop.${NC}\n"
wait

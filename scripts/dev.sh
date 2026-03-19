#!/usr/bin/env bash
# scripts/dev.sh — Start all Agentic Island services for local development.
#
# Usage:
#   ./scripts/dev.sh            # hub-api + hub-web + core
#   ./scripts/dev.sh --no-core  # hub-api + hub-web only
#
# Requires: pnpm
# Services:
#   hub-api  → http://localhost:4000
#   hub-web  → http://localhost:5173 (Vite, proxies /api + /ws to hub-api)
#   core     → http://localhost:3000
#
# Environment variables:
#   HUB_API_KEY   API key for the core to authenticate with hub-api
#   ADMIN_KEY     Master admin key for island-cli admin commands
#   WORLD_NAME    Name of the world (used by core)

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

# ── Start hub-api ────────────────────────────────────────────────────
echo -e "${GREEN}Starting hub-api…${NC}"
pnpm --filter @agentic-island/hub-api run dev 2>&1 | prefix "$GREEN" "hub-api" &
PIDS+=($!)
sleep 1

# ── Start hub-web (Vite) ────────────────────────────────────────────
echo -e "${BLUE}Starting hub-web…${NC}"
pnpm --filter @agentic-island/hub-web run dev 2>&1 | prefix "$BLUE" "hub-web" &
PIDS+=($!)

# ── Start core (unless --no-core) ────────────────────────────────────
if [[ "${1:-}" != "--no-core" ]]; then
  sleep 1
  echo -e "${RED}Starting core…${NC}"
  pnpm --filter @agentic-island/core run dev 2>&1 | prefix "$RED" "core" &
  PIDS+=($!)
fi

echo -e "\n${YELLOW}All services running. Press Ctrl+C to stop.${NC}\n"
wait

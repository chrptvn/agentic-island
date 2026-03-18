import type { WorldConfig } from "./world.js";

export interface WorldMeta {
  id: string;
  name: string;
  description?: string;
  configSnapshot?: Partial<WorldConfig>;
  playerCount: number;
  status: "online" | "offline";
  lastHeartbeatAt?: string;
  createdAt: string;
}

export interface ApiKeyInfo {
  id: string;
  label?: string;
  createdAt: string;
  lastSeenAt?: string;
}

export interface SpriteAsset {
  filename: string;
  mimeType: string;
  data: string;
}

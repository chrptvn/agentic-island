import type { IslandConfig } from "./island.js";

export interface IslandMeta {
  id: string;
  name: string;
  description?: string;
  configSnapshot?: Partial<IslandConfig>;
  thumbnailUrl?: string;
  playerCount: number;
  viewerCount: number;
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

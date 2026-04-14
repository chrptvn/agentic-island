'use client';

import { createPortal } from 'react-dom';
import type { CharacterState, EntityInstance } from '@agentic-island/shared';
import { EMOTION_PAIRS } from '@agentic-island/shared';

const ENTITY_LABELS: Record<string, string> = {
  young_tree: 'Oak Tree',
  old_tree_base: 'Oak Tree',
  young_berry: 'Berry Tree',
  old_berry_base: 'Berry Tree',
  young_berry_empty: 'Berry Tree',
  old_berry_empty_base: 'Berry Tree',
  rock: 'Rock',
  log_pile: 'Log Pile',
  campfire_lit: 'Campfire 🔥',
  campfire_extinct: 'Campfire',
  chest: 'Chest',
  flower_blue: 'Blue Flower 🔵',
  flower_red: 'Red Flower 🔴',
  flower_purple: 'Purple Flower 🟣',
  flower_white: 'White Flower ⚪',
  cotton_plant: 'Cotton',

};

export interface TooltipData {
  mouseX: number;
  mouseY: number;
  character: CharacterState | null;
  entity: EntityInstance | null;
  /** When set, the tooltip is anchored to a tile and moves with the camera. */
  anchorTileX?: number;
  anchorTileY?: number;
}

function StatBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-left text-text-muted">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-elevated">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-left">
        {Math.round(value)}/{max}
      </span>
    </div>
  );
}

function prettifyName(name: string): string {
  return name.replace(/_/g, ' ');
}

// ── Feelings (mirrors humanize.ts in the island app) ─────────────────────────

function ratioLabel(value: number, max: number, scale: [string, string, string, string, string, string]): string {
  const pct = max > 0 ? value / max : 0;
  if (pct <= 0)    return scale[0];
  if (pct <= 0.15) return scale[1];
  if (pct <= 0.35) return scale[2];
  if (pct <= 0.6)  return scale[3];
  if (pct <= 0.85) return scale[4];
  return scale[5];
}

function healthFeeling(v: number, max: number) {
  return ratioLabel(v, max, ['dead', 'dying', 'badly wounded', 'hurt', 'healthy', 'in perfect health']);
}
function hungerFeeling(v: number, max: number) {
  return ratioLabel(v, max, ['starving', 'very hungry', 'hungry', 'peckish', 'satisfied', 'full']);
}
function energyFeeling(v: number, max: number) {
  return ratioLabel(v, max, ['exhausted', 'very tired', 'tired', 'rested', 'energetic', 'full of energy']);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function mostProminentPhysical(stats: CharacterState['stats']): string {
  const healthDev = stats.maxHealth > 0 ? 1 - stats.health / stats.maxHealth : 0;
  const hungerDev  = stats.maxHunger > 0 ? 1 - stats.hunger / stats.maxHunger : 0;
  const energyDev  = stats.maxEnergy > 0 ? 1 - stats.energy / stats.maxEnergy : 0;
  if (healthDev >= hungerDev && healthDev >= energyDev) return healthFeeling(stats.health, stats.maxHealth);
  if (hungerDev >= energyDev) return hungerFeeling(stats.hunger, stats.maxHunger);
  return energyFeeling(stats.energy, stats.maxEnergy);
}

function mostProminentEmotion(emotions: Record<string, number> | undefined): string | null {
  if (!emotions) return null;
  let maxDev = 0;
  let label: string | null = null;
  for (const pair of EMOTION_PAIRS) {
    const val = emotions[pair.key] ?? 50;
    const dev = Math.abs(val - 50);
    if (dev > maxDev) {
      maxDev = dev;
      label = val < 50 ? pair.low : pair.high;
    }
  }
  return label;
}

function CharacterBox({ character }: { character: CharacterState }) {
  const { stats, inventory, equipment } = character;
  const equippedSlots = Object.entries(equipment).filter(
    ([, v]) => v !== null && v !== undefined,
  );
  const physical = mostProminentPhysical(stats);
  const emotion = mostProminentEmotion(stats.emotions);
  const feeling = emotion ? `${capitalize(emotion)} and ${physical}` : capitalize(physical);
  return (
    <div className="space-y-1">
      <p className="font-bold text-accent-cyan">{character.id}</p>
      {character.goal && (
        <p className="text-text-muted">&quot;{character.goal}&quot;</p>
      )}
      <p className="text-text-muted italic">{feeling}</p>
      {inventory.length > 0 && (
        <>
          <hr className="my-1 border-border-muted" />
          <p className="text-text-muted">Inventory</p>
          <div className="flex flex-col gap-y-0.5">
            {inventory.map((inv) => (
              <span key={inv.item}>
                {prettifyName(inv.item)} ×{inv.qty}
              </span>
            ))}
          </div>
        </>
      )}
      {equippedSlots.length > 0 && (
        <>
          <hr className="my-1 border-border-muted" />
          <p className="text-text-muted">🛡️ Equipment</p>
          <div className="flex flex-col gap-y-0.5">
            {equippedSlots.map(([slot, item]) => (
              <span key={slot}>
                {slot}: {prettifyName(item!.item)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Must match _healthCondition() in island.ts
function healthCondition(health: number, maxHealth: number): { label: string; color: string } {
  if (maxHealth <= 0) return { label: 'healthy', color: 'text-green-400' };
  const pct = (health / maxHealth) * 100;
  if (pct >= 80) return { label: 'healthy',   color: 'text-green-400' };
  if (pct >= 60) return { label: 'scratched',  color: 'text-yellow-400' };
  if (pct >= 40) return { label: 'damaged',    color: 'text-orange-400' };
  if (pct >= 20) return { label: 'battered',   color: 'text-red-400' };
  if (pct > 0)   return { label: 'critical',   color: 'text-red-500' };
  return { label: 'destroyed', color: 'text-gray-500' };
}

function EntityBox({ entity }: { entity: EntityInstance }) {
  const name = entity.name ?? ENTITY_LABELS[entity.tileId] ?? entity.tileId;
  const hp = entity.stats?.health;
  const maxHp = entity.stats?.maxHealth;
  const condition = hp !== undefined && maxHp !== undefined && maxHp > 0
    ? healthCondition(hp, maxHp)
    : null;

  // Resource counts: numeric stats excluding health/max* keys
  const resources = entity.stats
    ? Object.entries(entity.stats).filter(
        ([k, v]) => k !== 'health' && !k.startsWith('max') && k !== 'inventory' && typeof v === 'number' && v > 0,
      )
    : [];

  // Container inventory
  const inventory = entity.inventory ?? [];

  return (
    <div className="space-y-1">
      <p className="font-bold text-accent-gold">{name}</p>
      {condition && (
        <p className={`${condition.color} italic`}>{condition.label}</p>
      )}
      {resources.length > 0 && (
        <>
          <hr className="my-1 border-border-muted" />
          <div className="flex flex-col gap-y-0.5">
            {resources.map(([item, qty]) => (
              <span key={item}>
                {prettifyName(item)} ×{qty}
              </span>
            ))}
          </div>
        </>
      )}
      {inventory.length > 0 && (
        <>
          <hr className="my-1 border-border-muted" />
          <p className="text-text-muted">📦 Contents</p>
          <div className="flex flex-col gap-y-0.5">
            {inventory.map((inv) => (
              <span key={inv.item}>
                {prettifyName(inv.item)} ×{inv.qty}
              </span>
            ))}
          </div>
        </>
      )}
      {entity.occupants && entity.occupants.length > 0 && (
        <>
          <hr className="my-1 border-border-muted" />
          <p className="text-text-muted">🛏️ Resting inside</p>
          <div className="flex flex-col gap-y-0.5">
            {entity.occupants.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Tooltip({ data, portalContainer }: { data: TooltipData | null; portalContainer?: HTMLElement | null }) {
  if (!data || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[10000] min-w-[180px] max-w-xs rounded-lg border border-border-default bg-surface/90 p-3 font-mono text-xs text-text-primary shadow-lg backdrop-blur-sm"
      style={{ left: data.mouseX + 12, top: data.mouseY + 12 }}
    >
      {data.character && <CharacterBox character={data.character} />}
      {data.character && data.entity && (
        <hr className="my-2 border-border-muted" />
      )}
      {data.entity && <EntityBox entity={data.entity} />}
    </div>,
    portalContainer ?? document.body,
  );
}

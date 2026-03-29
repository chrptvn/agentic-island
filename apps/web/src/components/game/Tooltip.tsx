'use client';

import { createPortal } from 'react-dom';
import type { CharacterState, EntityInstance } from '@agentic-island/shared';

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
  skull: 'Skull 💀',
  flower_blue: 'Blue Flower 🔵',
  flower_red: 'Red Flower 🔴',
  flower_purple: 'Purple Flower 🟣',
  flower_white: 'White Flower ⚪',
  cotton_plant: 'Cotton',
  green_tent: 'Green Tent ⛺',
  green_tent_right: 'Green Tent ⛺',
  green_tent_top: 'Green Tent ⛺',
  green_tent_top_right: 'Green Tent ⛺',
  beige_tent: 'Beige Tent ⛺',
  beige_tent_right: 'Beige Tent ⛺',
  beige_tent_top: 'Beige Tent ⛺',
  beige_tent_top_right: 'Beige Tent ⛺',
};

export interface TooltipData {
  mouseX: number;
  mouseY: number;
  character: CharacterState | null;
  entity: EntityInstance | null;
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

function CharacterBox({ character }: { character: CharacterState }) {
  const { stats, inventory, equipment } = character;
  const equippedSlots = Object.entries(equipment).filter(
    ([, v]) => v !== null && v !== undefined,
  );
  return (
    <div className="space-y-1">
      <p className="font-bold text-accent-cyan">{character.id}</p>
      {character.goal && (
        <p className="text-text-muted">&quot;{character.goal}&quot;</p>
      )}
      <StatBar
        label="❤️ HP"
        value={stats.health}
        max={stats.maxHealth}
        color="bg-accent-red"
      />
      <StatBar
        label="🍖 Food"
        value={stats.hunger}
        max={stats.maxHunger}
        color="bg-accent-gold"
      />
      <StatBar
        label="⚡ NRG"
        value={stats.energy}
        max={stats.maxEnergy}
        color="bg-accent-emerald"
      />
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

function EntityBox({ entity }: { entity: EntityInstance }) {
  const name = ENTITY_LABELS[entity.tileId] ?? entity.tileId;
  const hp = entity.stats?.health;
  const maxHp = entity.stats?.maxHealth;

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
      {hp !== undefined && maxHp !== undefined && maxHp > 0 && (
        <StatBar label="❤️ HP" value={hp} max={maxHp} color="bg-accent-red" />
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

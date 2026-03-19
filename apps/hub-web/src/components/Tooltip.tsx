import { createPortal } from "react-dom";
import type { CharacterState, EntityInstance } from "@agentic-island/shared";

const ENTITY_LABELS: Record<string, string> = {
  young_tree: "Oak Tree",
  old_tree_base: "Oak Tree",
  young_berry: "Berry Tree",
  old_berry_base: "Berry Tree",
  young_berry_empty: "Berry Tree",
  old_berry_empty_base: "Berry Tree",
  rock: "Rock",
  log_pile: "Log Pile",
  campfire_lit: "Campfire 🔥",
  campfire_extinct: "Campfire",
  chest: "Chest",
};

function StatBar({ value, max }: { value: number; max: number }) {
  const pct = Math.round(((value ?? 0) / (max || 1)) * 10);
  const filled = Math.max(0, Math.min(10, pct));
  return (
    <span style={{ fontFamily: "monospace", letterSpacing: "-1px", color: "#a0c4ff" }}>
      {"█".repeat(filled)}
      <span style={{ opacity: 0.35 }}>{"░".repeat(10 - filled)}</span>
    </span>
  );
}

function TooltipBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "rgba(10,10,20,0.92)",
        color: "#e8e0c8",
        border: "1px solid #5a4a2a",
        borderRadius: "4px",
        padding: "6px 10px",
        fontSize: "12px",
        fontFamily: "monospace",
        lineHeight: "1.7",
        minWidth: "150px",
        maxWidth: "240px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {children}
    </div>
  );
}

function CharacterBox({ char }: { char: CharacterState }) {
  const s = char.stats;
  const hp  = Math.floor(s.health);
  const hun = Math.floor(s.hunger);
  const en  = Math.floor(s.energy);
  const equipment = char.equipment ?? {};
  const slots = ["hands", "head", "body", "legs", "feet"];
  const equippedSlots = slots.filter((sl) => equipment[sl]);
  const inventory = char.inventory ?? [];

  return (
    <TooltipBox>
      <div style={{ fontWeight: "bold", marginBottom: "2px" }}>{char.id}</div>
      <div>❤️ <StatBar value={s.health} max={s.maxHealth} /> {hp}/{s.maxHealth}</div>
      <div>🍖 <StatBar value={s.hunger} max={s.maxHunger} /> {hun}/{s.maxHunger}</div>
      <div>⚡ <StatBar value={s.energy} max={s.maxEnergy} /> {en}/{s.maxEnergy}</div>
      {equippedSlots.length > 0 && (
        <>
          <div style={{ marginTop: "6px", fontWeight: "bold" }}>equipped</div>
          {equippedSlots.map((sl) => (
            <div key={sl} style={{ color: "#b8e0b8" }}>
              [{sl}] {equipment[sl]?.item}
            </div>
          ))}
        </>
      )}
      {inventory.length > 0 && (
        <>
          <div style={{ marginTop: "6px", fontWeight: "bold" }}>inventory</div>
          {inventory.map((item) => (
            <div key={item.item} style={{ color: "#d4c89a" }}>
              {item.item}: {item.qty}
            </div>
          ))}
        </>
      )}
    </TooltipBox>
  );
}

function EntityBox({ entity }: { entity: EntityInstance }) {
  const label = ENTITY_LABELS[entity.tileId] ?? entity.tileId;
  const { health, maxHealth, ...otherStats } = entity.stats;
  const hasHealth = health != null && maxHealth != null;
  const extraEntries = Object.entries(otherStats).filter(([, v]) => v != null);

  return (
    <TooltipBox>
      <div style={{ fontWeight: "bold", marginBottom: "2px" }}>{label}</div>
      {hasHealth && (
        <div>
          ❤️ <StatBar value={health} max={maxHealth} /> {Math.floor(health)}/{maxHealth}
        </div>
      )}
      {extraEntries.map(([k, v]) => (
        <div key={k} style={{ color: "#d4c89a" }}>
          {k}: {v}
        </div>
      ))}
    </TooltipBox>
  );
}

export interface TooltipData {
  mouseX: number;
  mouseY: number;
  character: CharacterState | null;
  entity: EntityInstance | null;
}

export function Tooltip({ data }: { data: TooltipData | null }) {
  if (!data || (!data.character && !data.entity)) return null;

  const content = (
    <div
      style={{
        position: "fixed",
        left: data.mouseX + 14,
        top: data.mouseY + 14,
        zIndex: 1000,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      {data.character && <CharacterBox char={data.character} />}
      {data.entity && <EntityBox entity={data.entity} />}
    </div>
  );

  return createPortal(content, document.body);
}

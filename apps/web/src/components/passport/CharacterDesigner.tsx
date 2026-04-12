'use client';

import { useCallback } from 'react';
import type { CharacterAppearance, CharacterCatalog } from '@agentic-island/shared';

interface Props {
  catalog: CharacterCatalog;
  appearance: CharacterAppearance;
  onChange: (appearance: CharacterAppearance) => void;
}

const SKIN_EMOJI: Record<string, string> = {
  amber: '🟡',
  black: '⚫',
  bronze: '🟤',
  brown: '🟠',
  light: '⚪',
  olive: '🟢',
};

export default function CharacterDesigner({ catalog, appearance, onChange }: Props) {
  const set = useCallback(
    (key: string, value: string) => {
      onChange({ ...appearance, [key]: value });
    },
    [appearance, onChange],
  );

  const clear = useCallback(
    (key: string) => {
      const next = { ...appearance };
      delete next[key];
      onChange(next);
    },
    [appearance, onChange],
  );

  return (
    <div className="space-y-5">
      {/* Gender */}
      <OptionGroup
        label="Gender"
        options={catalog.genders}
        value={appearance.gender ?? catalog.genders[0]}
        onSelect={(v) => set('gender', v)}
      />

      {/* Skin color */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
          Skin Color
        </label>
        <div className="flex flex-wrap gap-2">
          {catalog.skinColors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => set('skinColor', color)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                (appearance.skinColor ?? 'light') === color
                  ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan'
                  : 'border-border-default bg-elevated text-text-primary hover:border-accent-cyan/40'
              }`}
            >
              <span>{SKIN_EMOJI[color] ?? '●'}</span>
              <span className="capitalize">{color}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Layers */}
      {Object.entries(catalog.layers)
        .filter(([name]) => name !== 'body') // body is controlled by skinColor + gender
        .sort(([, a], [, b]) => a.order - b.order)
        .map(([name, layer]) => (
          <div key={name}>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
              {name}
            </label>
            <div className="flex flex-wrap gap-2">
              {!layer.required && (
                <button
                  type="button"
                  onClick={() => clear(name)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    !appearance[name]
                      ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan'
                      : 'border-border-default bg-elevated text-text-muted hover:border-accent-cyan/40'
                  }`}
                >
                  None
                </button>
              )}
              {layer.items?.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => set(name, item)}
                  className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                    appearance[name] === item
                      ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan'
                      : 'border-border-default bg-elevated text-text-primary hover:border-accent-cyan/40'
                  }`}
                >
                  {item.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

function OptionGroup({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: string[];
  value: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(opt)}
            className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
              value === opt
                ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan'
                : 'border-border-default bg-elevated text-text-primary hover:border-accent-cyan/40'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

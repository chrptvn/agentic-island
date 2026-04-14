'use client';

import { useCallback } from 'react';
import type { CharacterAppearance, CharacterCatalog } from '@agentic-island/shared';

interface Props {
  catalog: CharacterCatalog;
  appearance: CharacterAppearance;
  onChange: (appearance: CharacterAppearance) => void;
}

const SKIN_TONES: { id: string; hex: string }[] = [
  { id: 'light',  hex: '#F9D5BA' },
  { id: 'amber',  hex: '#FDD082' },
  { id: 'olive',  hex: '#D38B59' },
  { id: 'bronze', hex: '#AE6B3F' },
  { id: 'brown',  hex: '#B7996A' },
  { id: 'black',  hex: '#603429' },
];

/** Approximate CSS colors for clothing color swatches */
const CLOTHING_CSS: Record<string, string> = {
  brown:  '#8b4513',
  black:  '#1a1a1a',
  blue:   '#4169e1',
  forest: '#228b22',
  gray:   '#808080',
  navy:   '#002080',
  red:    '#c0392b',
  tan:    '#c4a265',
};

/** Approximate CSS colors for hair color swatches */
const HAIR_CSS: Record<string, string> = {
  ash:          '#c0b8b0',
  black:        '#1a1a1a',
  blonde:       '#f5d65b',
  blue:         '#4169e1',
  carrot:       '#e8732a',
  chestnut:     '#954535',
  dark_brown:   '#4a2c0a',
  dark_gray:    '#555555',
  ginger:       '#d45500',
  gold:         '#f0c040',
  gray:         '#888888',
  green:        '#228b22',
  light_brown:  '#b5651d',
  navy:         '#002080',
  orange:       '#e87040',
  pink:         '#ff69b4',
  platinum:     '#e8e8d0',
  purple:       '#8b008b',
  raven:        '#2c2c40',
  red:          '#c0392b',
  redhead:      '#b03010',
  rose:         '#ff88aa',
  sandy:        '#deb887',
  strawberry:   '#e84060',
  violet:       '#8040c0',
  white:        '#f8f8f8',
};

const COLOR_CSS: Record<string, string> = { ...CLOTHING_CSS, ...HAIR_CSS };

export default function CharacterDesigner({ catalog, appearance, onChange }: Props) {
  const gender = appearance.gender ?? catalog.genders[0];

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

  /** When gender changes, also clear any layer selections unavailable for the new gender. */
  const setGender = useCallback(
    (newGender: string) => {
      const next: typeof appearance = { ...appearance, gender: newGender };
      for (const [layerName, layer] of Object.entries(catalog.layers)) {
        const selected = next[layerName];
        if (selected && layer.itemGenders?.[selected] && !layer.itemGenders[selected].includes(newGender)) {
          delete next[layerName];
        }
      }
      onChange(next);
    },
    [appearance, catalog.layers, onChange],
  );

  return (
    <div className="space-y-5">
      {/* Gender */}
      <OptionGroup
        label="Gender"
        options={catalog.genders}
        value={gender}
        onSelect={setGender}
      />

      {/* Skin tone */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
          Skin Tone
        </label>
        <div className="flex flex-wrap gap-2">
          {SKIN_TONES.map(({ id, hex }) => (
            <button
              key={id}
              type="button"
              title={id}
              onClick={() => set('body', id)}
              style={{ backgroundColor: hex }}
              className={`h-8 w-8 rounded-full border-2 transition-all ${
                (appearance.body ?? 'light') === id
                  ? 'border-white scale-110 shadow-md'
                  : 'border-transparent hover:border-white/60'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Layers */}
      {Object.entries(catalog.layers)
        .filter(([name]) => name !== 'body') // body is controlled by skinColor + gender
        .sort(([, a], [, b]) => a.order - b.order)
        .map(([name, layer]) => {
          const selectedItem = appearance[name];
          // Filter items to those available for the current gender
          const availableItems = layer.items?.filter(
            (item) => !layer.itemGenders?.[item] || layer.itemGenders[item].includes(gender),
          );
          // Skip entire layer if it has no items available for this gender (and isn't required)
          if (!layer.required && availableItems?.length === 0) return null;

          // Show swatches if: item is selected AND it's colorable
          const isColorableItem =
            selectedItem &&
            layer.colors &&
            layer.colorKey &&
            (!layer.colorableItems || layer.colorableItems.includes(selectedItem));
          const currentColor = layer.colorKey ? (appearance[layer.colorKey] ?? layer.colors?.[0]) : undefined;

          return (
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
                {availableItems?.map((item) => (
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

              {/* Color swatches — only shown when a colorable item is selected */}
              {isColorableItem && layer.colors && layer.colorKey && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-text-muted">Color:</span>
                  {layer.colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={color}
                      onClick={() => set(layer.colorKey!, color)}
                      style={{ backgroundColor: COLOR_CSS[color] ?? '#888' }}
                      className={`h-6 w-6 rounded-full border-2 transition-all ${
                        currentColor === color
                          ? 'border-white scale-110 shadow-md'
                          : 'border-transparent hover:border-white/60'
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
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

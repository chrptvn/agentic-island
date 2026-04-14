'use client';

import { useCallback } from 'react';
import type { PersonalityAxes } from '@/lib/personality';
import { AXIS_META, describeAxis } from '@/lib/personality';

interface Props {
  personality: PersonalityAxes;
  onChange: (personality: PersonalityAxes) => void;
}

export default function PersonalityPicker({ personality, onChange }: Props) {
  const set = useCallback(
    (key: keyof PersonalityAxes, value: number) => {
      onChange({ ...personality, [key]: value });
    },
    [personality, onChange],
  );

  return (
    <div className="space-y-5">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
        Personality
      </label>
      {AXIS_META.map(({ key, lowLabel, highLabel, lowColor, highColor }) => {
        const value = personality[key];
        const description = describeAxis(value, lowLabel, highLabel);

        return (
          <div key={key} className="space-y-1.5">
            {/* Trait labels */}
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium" style={{ color: lowColor }}>
                {lowLabel}
              </span>
              <span className="text-text-muted">{description}</span>
              <span className="font-medium" style={{ color: highColor }}>
                {highLabel}
              </span>
            </div>

            {/* Gradient slider */}
            <div className="relative">
              <div
                className="absolute inset-0 rounded-full h-2 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  background: `linear-gradient(to right, ${lowColor}, ${mixColor(lowColor, highColor)}, ${highColor})`,
                  opacity: 0.3,
                }}
              />
              <input
                type="range"
                min={-3}
                max={3}
                step={1}
                value={value}
                onChange={(e) => set(key, Number(e.target.value))}
                className="personality-slider relative z-10 w-full cursor-pointer"
                style={
                  {
                    '--slider-low': lowColor,
                    '--slider-high': highColor,
                    '--slider-mid': mixColor(lowColor, highColor),
                  } as React.CSSProperties
                }
              />
            </div>

            {/* Tick marks */}
            <div className="flex justify-between px-0.5">
              {Array.from({ length: 7 }, (_, i) => i - 3).map((tick) => (
                <div
                  key={tick}
                  className={`h-1 w-1 rounded-full ${
                    tick === value ? 'bg-text-primary' : 'bg-border-default'
                  }`}
                />
              ))}
            </div>
          </div>
        );
      })}

      <style jsx>{`
        .personality-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 8px;
          border-radius: 9999px;
          background: linear-gradient(
            to right,
            var(--slider-low),
            var(--slider-mid),
            var(--slider-high)
          );
          outline: none;
          opacity: 0.85;
          transition: opacity 0.15s;
        }
        .personality-slider:hover {
          opacity: 1;
        }
        .personality-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #fef9f3;
          border: 2px solid #d4c5b0;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .personality-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        .personality-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #fef9f3;
          border: 2px solid #d4c5b0;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
        }
        .personality-slider::-moz-range-track {
          height: 8px;
          border-radius: 9999px;
          background: linear-gradient(
            to right,
            var(--slider-low),
            var(--slider-mid),
            var(--slider-high)
          );
        }
      `}</style>
    </div>
  );
}

/** Approximate midpoint between two hex colors. */
function mixColor(a: string, b: string): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const mix = (x: number, y: number) =>
    Math.round((x + y) / 2)
      .toString(16)
      .padStart(2, '0');
  return `#${mix(r1, r2)}${mix(g1, g2)}${mix(b1, b2)}`;
}

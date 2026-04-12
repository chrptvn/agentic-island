'use client';

import { useRef, useEffect } from 'react';
import type { CharacterAppearance } from '@agentic-island/shared';
import catalog from '@/lib/character-catalog.json';

const TILE = catalog.tileSize; // 64
const SCALE = 3; // render at 3× for crisp pixel art
const CANVAS_SIZE = TILE * SCALE;

// Direction order from catalog: ["n", "w", "s", "e"] → south is row 2
const SOUTH_ROW = 2;

interface Props {
  appearance: CharacterAppearance;
  className?: string;
}

type LayerDef = {
  order: number;
  required?: boolean;
  items?: string[];
  pathTemplate: string;
};

const layers = catalog.layers as Record<string, LayerDef>;

/** Build the sprite path for a given layer + appearance. */
function getSpritePath(
  layerName: string,
  layer: LayerDef,
  appearance: CharacterAppearance,
): string | null {
  const gender = appearance.gender ?? 'male';

  if (layerName === 'body') {
    const skin = appearance.skinColor ?? 'light';
    return `/characters/bodies/${skin}/${gender}/idle.png`;
  }

  const itemKey = appearance[layerName as keyof CharacterAppearance] as string | undefined;
  if (!itemKey) return null;

  return `/characters/${layer.pathTemplate
    .replace('{item}', itemKey)
    .replace('{gender}', gender)
    .replace('{anim}', 'idle')}`;
}

export default function CharacterPreview({ appearance, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.imageSmoothingEnabled = false;

    // Sort layers by order
    const sortedLayers = Object.entries(layers).sort(
      ([, a], [, b]) => a.order - b.order,
    );

    let loadedCount = 0;
    const totalToLoad: HTMLImageElement[] = [];

    for (const [name, layer] of sortedLayers) {
      const path = getSpritePath(name, layer, appearance);
      if (!path) continue;

      const img = new Image();
      img.src = path;
      totalToLoad.push(img);

      img.onload = () => {
        loadedCount++;
        if (loadedCount === totalToLoad.length) {
          // All loaded — draw in order
          ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
          for (const loadedImg of totalToLoad) {
            // Extract south-facing first frame (col 0, row SOUTH_ROW)
            ctx.drawImage(
              loadedImg,
              0, SOUTH_ROW * TILE, TILE, TILE, // source
              0, 0, CANVAS_SIZE, CANVAS_SIZE,   // dest (scaled)
            );
          }
        }
      };
      img.onerror = () => {
        loadedCount++;
      };
    }

    if (totalToLoad.length === 0) {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }
  }, [appearance]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      className={className}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

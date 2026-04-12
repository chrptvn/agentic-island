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

    const sortedLayers = Object.entries(layers).sort(
      ([, a], [, b]) => a.order - b.order,
    );

    let cancelled = false;
    let settledCount = 0;
    const images: { img: HTMLImageElement; loaded: boolean }[] = [];

    const drawAll = () => {
      if (cancelled) return;
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      for (const entry of images) {
        if (!entry.loaded) continue;
        ctx.drawImage(
          entry.img,
          0, SOUTH_ROW * TILE, TILE, TILE,
          0, 0, CANVAS_SIZE, CANVAS_SIZE,
        );
      }
    };

    for (const [name, layer] of sortedLayers) {
      const path = getSpritePath(name, layer, appearance);
      if (!path) continue;

      const img = new Image();
      const entry = { img, loaded: false };
      images.push(entry);

      img.onload = () => {
        entry.loaded = true;
        settledCount++;
        if (settledCount === images.length) drawAll();
      };
      img.onerror = () => {
        settledCount++;
        if (settledCount === images.length) drawAll();
      };
      img.src = path;
    }

    if (images.length === 0) {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    return () => {
      cancelled = true;
      for (const entry of images) {
        entry.img.onload = null;
        entry.img.onerror = null;
        entry.img.src = '';
      }
    };
  }, [appearance]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      role="img"
      aria-label="Character preview"
      className={className}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

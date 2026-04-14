'use client';

import { useRef, useEffect } from 'react';
import type { CharacterAppearance, CharacterCatalog } from '@agentic-island/shared';

const SCALE = 3; // render at 3× for crisp pixel art

// Direction order from catalog: ["n", "w", "s", "e"] → south is row 2
const SOUTH_ROW = 2;

interface Props {
  appearance: CharacterAppearance;
  catalog: CharacterCatalog;
  className?: string;
}

/** Build the sprite path for a given layer + appearance. */
function getSpritePath(
  layerName: string,
  layer: CharacterCatalog['layers'][string],
  appearance: CharacterAppearance,
): string | null {
  const gender = appearance.gender ?? 'male';

  if (layerName === 'body') {
    const skin = appearance.body ?? appearance.skinColor ?? 'light';
    return `/characters/bodies/${skin}/${gender}/idle.png`;
  }

  const itemKey = appearance[layerName as keyof CharacterAppearance] as string | undefined;
  if (!itemKey) return null;

  // Choose the right template — colorable items get their own path template
  let template = layer.pathTemplate;
  if (layer.colorableItems && layer.colorPathTemplate && layer.colorableItems.includes(itemKey)) {
    template = layer.colorPathTemplate;
  }

  let path = template
    .replace('{item}', itemKey)
    .replace('{gender}', gender)
    .replace('{anim}', 'idle');

  // Substitute color placeholder if present
  if (path.includes('{color}')) {
    const color = (layer.colorKey ? appearance[layer.colorKey] : undefined)
      ?? layer.colors?.[0]
      ?? 'brown';
    path = path.replace('{color}', color);
  }

  return `/characters/${path}`;
}

export default function CharacterPreview({ appearance, catalog, className }: Props) {
  const TILE = catalog.tileSize;
  const CANVAS_SIZE = TILE * SCALE;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.imageSmoothingEnabled = false;

    const sortedLayers = Object.entries(catalog.layers).sort(
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
  }, [appearance, catalog, TILE, CANVAS_SIZE]);

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

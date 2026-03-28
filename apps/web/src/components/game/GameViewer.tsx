'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { GameRenderer } from '@agentic-island/game-renderer';
import type { WorldState } from '@agentic-island/shared';
import Tooltip, { type TooltipData } from './Tooltip';

const TILE_SIZE = 16;
const SCALE_FACTOR = 2;

// Fixed viewport resolution (16:9)
const VIEWPORT_WIDTH = 960;
const VIEWPORT_HEIGHT = 540;

interface GameViewerProps {
  state: WorldState | null;
  spriteBaseUrl: string | null;
}

interface SpeechOverlay {
  id: string;
  text: string;
  cssX: number;
  cssY: number;
}

export default function GameViewer({ state, spriteBaseUrl }: GameViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const spritesLoadedRef = useRef(false);
  const stateRef = useRef<WorldState | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [speechOverlays, setSpeechOverlays] = useState<SpeechOverlay[]>([]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const hasTileRegistry = !!state?.tileRegistry;

  // Compute speech bubble positions from character data + camera state
  const updateSpeechOverlays = useCallback(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    const s = stateRef.current;
    if (!renderer || !canvas || !s) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const cssScaleX = rect.width / canvas.width;
    const cssScaleY = rect.height / canvas.height;
    const now = Date.now();

    const overlays: SpeechOverlay[] = [];
    for (const char of s.characters) {
      if (char.speech?.text && char.speech.expiresAt > now) {
        const screen = renderer.tileToScreen(char.x, char.y);
        overlays.push({
          id: char.id,
          text: char.speech.text,
          cssX: screen.x * cssScaleX,
          cssY: screen.y * cssScaleY,
        });
      }
    }

    setSpeechOverlays(overlays);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      const s = stateRef.current;
      if (!canvas || !renderer || !s) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const { tileX, tileY } = renderer.screenToTile(
        (e.clientX - rect.left) * scaleX,
        (e.clientY - rect.top) * scaleY,
      );

      const character =
        s.characters.find((c) => c.x === tileX && c.y === tileY) ?? null;
      const entity =
        s.entities.find((en) => en.x === tileX && en.y === tileY) ?? null;

      if (character || entity) {
        setTooltip({
          mouseX: e.clientX,
          mouseY: e.clientY,
          character,
          entity,
        });
      } else {
        setTooltip(null);
      }
    },
    [],
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // Initialize renderer with fixed viewport resolution
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = VIEWPORT_WIDTH;
    canvas.height = VIEWPORT_HEIGHT;

    const renderer = new GameRenderer({
      canvas,
      tileSize: TILE_SIZE,
      scaleFactor: SCALE_FACTOR,
    });
    rendererRef.current = renderer;

    // Update HTML speech overlays on every rendered frame
    renderer.onFrame = updateSpeechOverlays;

    renderer.start();

    return () => {
      renderer.destroy();
      rendererRef.current = null;
      spritesLoadedRef.current = false;
    };
  }, [updateSpeechOverlays]);

  // Load sprites
  useEffect(() => {
    if (!rendererRef.current || !spriteBaseUrl || !state?.tileRegistry) return;
    if (spritesLoadedRef.current) return;

    const sheets: Record<
      string,
      { url: string; tileSize?: number; gap?: number }
    > = {};
    for (const tile of Object.values(state.tileRegistry)) {
      if (tile.sheet && !sheets[tile.sheet]) {
        sheets[tile.sheet] = {
          url: `${spriteBaseUrl}${tile.sheet}`,
          tileSize: tile.tileSize,
          gap: tile.gap,
        };
      }
    }

    rendererRef.current
      .loadSpritesFromUrls(sheets)
      .then(() => {
        spritesLoadedRef.current = true;
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spriteBaseUrl, hasTileRegistry]);

  // Update state — camera initialization is handled by the renderer
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !state) return;
    renderer.setState(state);
  }, [state]);

  return (
    <div className="relative w-full aspect-[16/9] bg-black rounded-lg overflow-hidden">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="block w-full h-full cursor-crosshair"
        style={{ imageRendering: 'pixelated' }}
      />
      {speechOverlays.map((bubble) => (
        <div
          key={bubble.id}
          className="pointer-events-none absolute z-40 max-w-xs -translate-x-1/2 -translate-y-full rounded-lg border border-border-default bg-surface/90 px-3 py-2 font-mono text-xs text-text-primary shadow-lg backdrop-blur-sm"
          style={{ left: bubble.cssX, top: bubble.cssY - 4 }}
        >
          <p className="font-bold text-accent-cyan text-[10px] mb-0.5">{bubble.id}</p>
          <p>{bubble.text}</p>
          {/* Tail triangle */}
          <div
            className="absolute left-1/2 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-border-default"
            style={{ bottom: -6 }}
          />
        </div>
      ))}
      <Tooltip data={tooltip} />
    </div>
  );
}

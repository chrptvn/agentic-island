import { useRef, useEffect, useState, useCallback } from "react";
import { GameRenderer } from "@agentic-island/game-renderer";
import type { WorldState } from "@agentic-island/shared";
import { Tooltip, type TooltipData } from "./Tooltip.js";

const TILE_SIZE = 16;
const SCALE_FACTOR = 2;
const PX_PER_TILE = TILE_SIZE * SCALE_FACTOR; // 32px

interface GameViewerProps {
  state: WorldState | null;
  spriteBaseUrl: string | null;
}

export function GameViewer({ state, spriteBaseUrl }: GameViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const spritesLoadedRef = useRef(false);
  const stateRef = useRef<WorldState | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Keep a ref to state so mouse handlers don't need to be re-created on every update
  useEffect(() => { stateRef.current = state; }, [state]);

  // Derive canvas pixel dimensions from map size (fallback before first state)
  const canvasW = state?.map ? state.map.width * PX_PER_TILE : 960;
  const canvasH = state?.map ? state.map.height * PX_PER_TILE : 640;

  // Stable flag: becomes true once tileRegistry is available, never goes back
  const hasTileRegistry = !!state?.tileRegistry;

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const s = stateRef.current;
    if (!canvas || !s) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const tileX = Math.floor((e.clientX - rect.left) * scaleX / PX_PER_TILE);
    const tileY = Math.floor((e.clientY - rect.top) * scaleY / PX_PER_TILE);

    const character = s.characters.find((c) => c.x === tileX && c.y === tileY) ?? null;
    const entity = s.entities.find((en) => en.x === tileX && en.y === tileY) ?? null;

    if (character || entity) {
      setTooltip({ mouseX: e.clientX, mouseY: e.clientY, character, entity });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // Initialize renderer
  useEffect(() => {
    if (!canvasRef.current) return;

    const renderer = new GameRenderer({
      canvas: canvasRef.current,
      tileSize: TILE_SIZE,
      scaleFactor: SCALE_FACTOR,
    });
    rendererRef.current = renderer;
    renderer.start();

    return () => {
      renderer.destroy();
      rendererRef.current = null;
      spritesLoadedRef.current = false;
    };
  }, []);

  // Load sprites once when both spriteBaseUrl and tileRegistry are first available
  useEffect(() => {
    if (!rendererRef.current || !spriteBaseUrl || !state?.tileRegistry) return;
    if (spritesLoadedRef.current) return;

    const sheets: Record<string, { url: string; tileSize?: number; gap?: number }> = {};
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
      .then(() => { spritesLoadedRef.current = true; })
      .catch(console.error);
  // hasTileRegistry is a boolean that flips once (false→true), spriteBaseUrl is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spriteBaseUrl, hasTileRegistry]);

  // Update state
  useEffect(() => {
    if (rendererRef.current && state) {
      rendererRef.current.setState(state);
    }
  }, [state]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          display: "block",
          maxWidth: "100%",
          imageRendering: "pixelated",
          background: "#000",
          borderRadius: "0.5rem",
          cursor: "crosshair",
        }}
      />
      <Tooltip data={tooltip} />
    </>
  );
}

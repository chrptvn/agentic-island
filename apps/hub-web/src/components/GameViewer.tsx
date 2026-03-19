import { useRef, useEffect } from "react";
import { GameRenderer } from "@agentic-island/game-renderer";
import type { WorldState } from "@agentic-island/shared";

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

  // Derive canvas pixel dimensions from map size (fallback before first state)
  const canvasW = state?.map ? state.map.width * PX_PER_TILE : 960;
  const canvasH = state?.map ? state.map.height * PX_PER_TILE : 640;

  // Stable flag: becomes true once tileRegistry is available, never goes back
  const hasTileRegistry = !!state?.tileRegistry;

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
    <canvas
      ref={canvasRef}
      width={canvasW}
      height={canvasH}
      style={{
        display: "block",
        maxWidth: "100%",
        imageRendering: "pixelated",
        background: "#000",
        borderRadius: "0.5rem",
      }}
    />
  );
}

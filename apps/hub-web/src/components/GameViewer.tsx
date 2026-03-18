import { useRef, useEffect } from "react";
import { GameRenderer } from "@agentic-island/game-renderer";
import type { WorldState } from "@agentic-island/shared";

interface GameViewerProps {
  state: WorldState | null;
  spriteBaseUrl: string | null;
  width?: number;
  height?: number;
}

export function GameViewer({
  state,
  spriteBaseUrl,
  width = 800,
  height = 600,
}: GameViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const spritesLoadedRef = useRef(false);

  // Initialize renderer
  useEffect(() => {
    if (!canvasRef.current) return;

    const renderer = new GameRenderer({
      canvas: canvasRef.current,
      tileSize: 16,
      scaleFactor: 2,
    });
    rendererRef.current = renderer;
    renderer.start();

    return () => {
      renderer.destroy();
      rendererRef.current = null;
      spritesLoadedRef.current = false;
    };
  }, []);

  // Load sprites when spriteBaseUrl changes
  useEffect(() => {
    if (!rendererRef.current || !spriteBaseUrl || !state?.tileRegistry) return;
    if (spritesLoadedRef.current) return;

    // Discover unique sheets from the tile registry
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
  }, [spriteBaseUrl, state?.tileRegistry]);

  // Update state
  useEffect(() => {
    if (rendererRef.current && state) {
      rendererRef.current.setState(state);
    }
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        width: "100%",
        maxWidth: `${width}px`,
        imageRendering: "pixelated",
        background: "#000",
        borderRadius: "0.5rem",
      }}
    />
  );
}

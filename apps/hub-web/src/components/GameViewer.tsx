import { useRef, useEffect, useState, useCallback } from "react";
import { GameRenderer } from "@agentic-island/game-renderer";
import type { WorldState } from "@agentic-island/shared";
import { Tooltip, type TooltipData } from "./Tooltip.js";

const TILE_SIZE = 16;
const SCALE_FACTOR = 2;

interface GameViewerProps {
  state: WorldState | null;
  spriteBaseUrl: string | null;
}

export function GameViewer({ state, spriteBaseUrl }: GameViewerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const spritesLoadedRef = useRef(false);
  const stateRef = useRef<WorldState | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Keep a ref to state so mouse handlers don't need to be re-created on every update
  useEffect(() => { stateRef.current = state; }, [state]);

  // Stable flag: becomes true once tileRegistry is available, never goes back
  const hasTileRegistry = !!state?.tileRegistry;

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    const s = stateRef.current;
    if (!canvas || !renderer || !s) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const screenY = (e.clientY - rect.top) * (canvas.height / rect.height);
    const { tileX, tileY } = renderer.screenToTile(screenX, screenY);

    const character = s.characters.find((c) => c.x === tileX && c.y === tileY) ?? null;
    const entity = s.entities.find((en) => en.x === tileX && en.y === tileY) ?? null;

    if (character || entity) {
      setTooltip({ mouseX: e.clientX, mouseY: e.clientY, character, entity });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // Initialize renderer + ResizeObserver
  useEffect(() => {
    if (!canvasRef.current || !wrapperRef.current) return;

    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;

    const renderer = new GameRenderer({
      canvas,
      tileSize: TILE_SIZE,
      scaleFactor: SCALE_FACTOR,
    });
    rendererRef.current = renderer;

    // Size canvas to container
    const resizeCanvas = () => {
      const { width, height } = wrapper.getBoundingClientRect();
      const w = Math.round(width * devicePixelRatio);
      const h = Math.round(height * devicePixelRatio);
      if (canvas.width !== w || canvas.height !== h) {
        renderer.resize(w, h);
      }
    };
    resizeCanvas();

    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(wrapper);

    renderer.start();

    return () => {
      ro.disconnect();
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

  const handleZoomIn = useCallback(() => rendererRef.current?.zoomIn(), []);
  const handleZoomOut = useCallback(() => rendererRef.current?.zoomOut(), []);
  const handleResetCamera = useCallback(() => rendererRef.current?.resetCamera(), []);

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%", height: "100%", minHeight: 400 }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          imageRendering: "pixelated",
          background: "#000",
          borderRadius: "0.5rem",
          touchAction: "none",
        }}
      />

      {/* Zoom controls */}
      <div style={{
        position: "absolute",
        bottom: 12,
        right: 12,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}>
        <ZoomButton label="+" onClick={handleZoomIn} title="Zoom in" />
        <ZoomButton label="−" onClick={handleZoomOut} title="Zoom out" />
        <ZoomButton label="⟲" onClick={handleResetCamera} title="Reset view" />
      </div>

      <Tooltip data={tooltip} />
    </div>
  );
}

function ZoomButton({ label, onClick, title }: { label: string; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32,
        height: 32,
        fontSize: 18,
        lineHeight: 1,
        border: "none",
        borderRadius: 6,
        background: "rgba(0,0,0,0.55)",
        color: "#fff",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      {label}
    </button>
  );
}

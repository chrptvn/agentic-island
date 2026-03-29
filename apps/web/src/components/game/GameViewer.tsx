'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { GameRenderer } from '@agentic-island/game-renderer';
import type { IslandState } from '@agentic-island/shared';
import Tooltip, { type TooltipData } from './Tooltip';
import RecordingOverlay from './RecordingOverlay';
import RecordingControls from './RecordingControls';
import SaveDialog from './SaveDialog';
import { useRecording } from '@/hooks/useRecording';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useIsMobile } from '@/hooks/useIsMobile';

const TILE_SIZE = 16;
const SCALE_FACTOR = 2;

// Fixed viewport resolution (16:9)
const VIEWPORT_WIDTH = 960;
const VIEWPORT_HEIGHT = 540;

interface GameViewerProps {
  state: IslandState | null;
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
  const stateRef = useRef<IslandState | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [speechOverlays, setSpeechOverlays] = useState<SpeechOverlay[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const isMobile = useIsMobile();
  const { isFullscreen, toggleFullscreen, isPseudoFullscreen } = useFullscreen(containerRef);

  const [recState, recActions] = useRecording();

  // Keep stable refs for recording callbacks so the renderer init effect
  // doesn't re-run when recActions identity changes.
  const recActionsRef = useRef(recActions);
  recActionsRef.current = recActions;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Push every new state into the recording buffer.
  // Use ref to avoid re-running on every render (recActions is a new object each render).
  useEffect(() => {
    if (state) recActionsRef.current.pushState(state);
  }, [state]);

  const hasTileRegistry = !!state?.tileRegistry;

  // Resize canvas when entering/exiting fullscreen, and auto-cancel recording
  // on exit to avoid resolution mismatch. Merged into a single effect to
  // guarantee cancel happens before resize.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (isFullscreen) {
      renderer.resize(window.innerWidth, window.innerHeight);
      recActionsRef.current.setCanvas(canvasRef.current);
    } else {
      // Cancel recording before resizing to avoid brief cropRect mismatch
      if (recState.mode === 'recording' || recState.mode === 'preview') {
        recActionsRef.current.cancel();
      }
      renderer.resize(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      recActionsRef.current.setCanvas(canvasRef.current);
    }
  }, [isFullscreen, recState.mode]);

  // Handle window resize while in fullscreen (e.g. orientation change).
  // During active recording, cancel instead of resizing to avoid crop mismatch.
  useEffect(() => {
    if (!isFullscreen) return;

    const onResize = () => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      if (recState.mode === 'recording') {
        recActionsRef.current.cancel();
      }
      renderer.resize(window.innerWidth, window.innerHeight);
      recActionsRef.current.setCanvas(canvasRef.current);
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isFullscreen, recState.mode]);

  const handleRecordPress = useCallback(() => {
    if (isMobile && isFullscreen) {
      recActions.openRecordModeMobile(window.innerWidth, window.innerHeight);
    } else {
      recActions.openRecordMode();
    }
  }, [isMobile, isFullscreen, recActions]);

  // Track container size for overlay positioning
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

    // Update HTML speech overlays on every rendered frame.
    // During recording playback, also advance the renderer state.
    // Use ref for recording callback to avoid effect re-runs.
    renderer.onFrame = () => {
      updateSpeechOverlays();
      // During recording, feed the playback state to the renderer each frame
      const displayState = recActionsRef.current.getDisplayState();
      if (displayState) renderer.setState(displayState);
      recActionsRef.current.onFrame();
    };

    // Give the recording system a ref to the canvas
    recActionsRef.current.setCanvas(canvas);

    renderer.start();

    return () => {
      renderer.destroy();
      rendererRef.current = null;
      spritesLoadedRef.current = false;
      recActionsRef.current.setCanvas(null);
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

  // Update state — use buffered state when paused/recording, live state otherwise
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const displayState = recActions.getDisplayState();
    const effectiveState = displayState ?? state;
    if (effectiveState) renderer.setState(effectiveState);
  }, [state, recActions, recState.playheadOffset, recState.mode, recState.isLive]);

  const isRecordingActive =
    recState.mode === 'preview' || recState.mode === 'recording';

  const canvasWidth = isFullscreen ? window.innerWidth : VIEWPORT_WIDTH;
  const canvasHeight = isFullscreen ? window.innerHeight : VIEWPORT_HEIGHT;

  // On mobile, only show record button when in fullscreen
  const showRecordButton =
    recState.mode === 'idle' && recState.supported && (!isMobile || isFullscreen);

  return (
    <div
      ref={containerRef}
      className={`relative bg-black overflow-hidden game-viewer-container ${
        isFullscreen
          ? 'w-full h-full'
          : 'w-full aspect-[16/9] rounded-lg'
      }`}
    >
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
          <div
            className="absolute left-1/2 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-border-default"
            style={{ bottom: -6 }}
          />
        </div>
      ))}
      <Tooltip data={tooltip} />

      {/* Fullscreen toggle button */}
      {recState.mode === 'idle' && (
        <button
          onClick={toggleFullscreen}
          className={`absolute left-3 top-3 z-20 rounded-lg bg-black/50 p-2 text-white/70 transition-all hover:bg-black/70 hover:text-white ${
            isMobile ? 'min-h-[44px] min-w-[44px] flex items-center justify-center' : ''
          }`}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          )}
        </button>
      )}

      {/* Record button (shown in idle mode; on mobile, only when fullscreen) */}
      {showRecordButton && (
        <button
          onClick={handleRecordPress}
          className={`absolute right-3 top-3 z-20 rounded-lg bg-black/50 p-2 text-white/70 transition-all hover:bg-black/70 hover:text-white ${
            isMobile ? 'min-h-[44px] min-w-[44px] flex items-center justify-center' : ''
          }`}
          title="Record clip"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="m22 8-6 4 6 4V8Z" />
            <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
          </svg>
        </button>
      )}

      {/* Recording overlay (crop window) */}
      {isRecordingActive && recState.cropRect && (
        <RecordingOverlay
          cropRect={recState.cropRect}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          isRecording={recState.mode === 'recording'}
        />
      )}

      {/* Recording controls */}
      <RecordingControls
        mode={recState.mode}
        resolution={recState.resolution}
        isLive={recState.isLive}
        playheadOffset={recState.playheadOffset}
        bufferDuration={recState.bufferDuration}
        elapsed={recState.elapsed}
        onSelectResolution={recActions.selectResolution}
        onToggleLive={recActions.toggleLive}
        onSetPlayheadOffset={recActions.setPlayheadOffset}
        onStartRecording={recActions.startRecording}
        onStopRecording={recActions.stopRecording}
        onCancel={recActions.cancel}
        isMobile={isMobile}
        isFullscreen={isFullscreen}
      />

      {/* Save dialog */}
      {recState.mode === 'saving' && recState.blob && (
        <SaveDialog blob={recState.blob} onDismiss={recActions.dismiss} />
      )}
    </div>
  );
}

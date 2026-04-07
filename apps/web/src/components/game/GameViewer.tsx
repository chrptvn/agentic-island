'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { GameRenderer } from '@agentic-island/game-renderer';
import type { IslandState } from '@agentic-island/shared';
import Tooltip, { type TooltipData } from './Tooltip';
import RecordingOverlay from './RecordingOverlay';
import RecordingControls from './RecordingControls';
import SaveDialog from './SaveDialog';
import { useRecording } from '@/hooks/useRecording';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useIsMobile } from '@/hooks/useIsMobile';

const TILE_SIZE = 64;
const SCALE_FACTOR = 1;

// Fixed viewport resolution (16:9)
const VIEWPORT_WIDTH = 960;
const VIEWPORT_HEIGHT = 540;

interface GameViewerProps {
  state: IslandState | null;
  spriteBaseUrl: string | null;
  spriteVersion?: string | null;
}

interface FollowButtonOverlay {
  id: string;
  cssX: number;
  cssY: number;
}

export default function GameViewer({ state, spriteBaseUrl, spriteVersion }: GameViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const spritesLoadedRef = useRef(false);
  const stateRef = useRef<IslandState | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const tooltipRef = useRef<TooltipData | null>(null);
  const [followButtonOverlay, setFollowButtonOverlay] = useState<FollowButtonOverlay | null>(null);

  // Follow feature refs (used in callbacks, not needing React re-renders)
  const selectedCharIdRef = useRef<string | null>(null);
  const followedCharIdRef = useRef<string | null>(null);
  // Drag vs click detection
  const pointerDownPosRef = useRef({ x: 0, y: 0 });
  const wasDraggingRef = useRef(false);
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

  // Track the number of unique sprite sheets in the tile registry.
  // When a new character connects, their body+head sheets are added to the
  // registry and this count changes, triggering the sprite-loading effect.
  const registrySheetCount = useMemo(() => {
    if (!state?.tileRegistry) return 0;
    const sheets = new Set<string>();
    for (const tile of Object.values(state.tileRegistry)) {
      if (tile.sheet) sheets.add(tile.sheet);
    }
    return sheets.size;
  }, [state?.tileRegistry]);

  const prevIsFullscreenRef = useRef(isFullscreen);
  const recStateModeRef = useRef(recState.mode);
  useEffect(() => { recStateModeRef.current = recState.mode; }, [recState.mode]);

  // Match overlay canvas pixel dimensions to the game canvas CSS display size
  const resizeOverlayCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!canvas || !overlay) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    overlay.width = Math.round(rect.width * dpr);
    overlay.height = Math.round(rect.height * dpr);
  }, []);

  // Resize canvas only when fullscreen state changes. Cancel recording if
  // exiting fullscreen mid-session to avoid crop mismatch.
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const wasFullscreen = prevIsFullscreenRef.current;
    prevIsFullscreenRef.current = isFullscreen;
    const exitingFullscreen = wasFullscreen && !isFullscreen;

    if (isFullscreen) {
      renderer.resize(window.innerWidth, window.innerHeight);
      recActionsRef.current.setCanvas(canvasRef.current);
    } else {
      if (exitingFullscreen) {
        const mode = recStateModeRef.current;
        if (mode === 'recording' || mode === 'preview') {
          recActionsRef.current.cancel();
        }
      }
      renderer.resize(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
      recActionsRef.current.setCanvas(canvasRef.current);
    }
    resizeOverlayCanvas();
  }, [isFullscreen]); // intentionally excludes recState.mode — use ref to avoid camera reset on mode changes

  // Handle window resize while in fullscreen (e.g. orientation change).
  // During active recording, cancel instead of resizing to avoid crop mismatch.
  useEffect(() => {
    if (!isFullscreen) return;

    const onResize = () => {
      const renderer = rendererRef.current;
      if (!renderer) return;

      if (recStateModeRef.current === 'recording') {
        recActionsRef.current.cancel();
      }
      renderer.resize(window.innerWidth, window.innerHeight);
      recActionsRef.current.setCanvas(canvasRef.current);
      resizeOverlayCanvas();
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isFullscreen]);

  const handleRecordPress = useCallback(() => {
    if (isMobile && isFullscreen) {
      recActions.openRecordModeMobile(window.innerWidth, window.innerHeight);
    } else {
      recActions.openRecordMode();
    }
  }, [isMobile, isFullscreen, recActions]);

  // On non-fullscreen, scroll the canvas bottom into view when preview/recording
  // mode starts so the bottom controls bar is visible.
  useEffect(() => {
    if (isFullscreen) return;
    if (recState.mode === 'preview' || recState.mode === 'recording') {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isFullscreen, recState.mode]);
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

  // Compute follow button + tooltip positions from character data + camera state.
  const updateOverlayPositions = useCallback(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    const s = stateRef.current;
    if (!renderer || !canvas || !s) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const cssScaleX = rect.width / canvas.width;
    const cssScaleY = rect.height / canvas.height;

    // Compute follow button position for selected character
    const selId = selectedCharIdRef.current;
    if (selId) {
      const selChar = s.characters.find((c) => c.id === selId);
      if (selChar) {
        const visual = renderer.getVisualPosition(selChar.id);
        const screen = renderer.tileToScreen(visual?.x ?? selChar.x, visual?.y ?? selChar.y);
        setFollowButtonOverlay({
          id: selId,
          cssX: screen.x * cssScaleX,
          cssY: screen.y * cssScaleY,
        });
      } else {
        // Character no longer on the map — clear selection
        selectedCharIdRef.current = null;
        followedCharIdRef.current = null;
        setFollowButtonOverlay(null);
      }
    } else {
      setFollowButtonOverlay(null);
    }

    // Reposition tile-anchored tooltip (moves with camera)
    const tip = tooltipRef.current;
    if (tip && tip.anchorTileX !== undefined && tip.anchorTileY !== undefined) {
      const screen = renderer.tileToScreen(tip.anchorTileX, tip.anchorTileY);
      const newX = rect.left + screen.x * cssScaleX;
      const newY = rect.top + screen.y * cssScaleY;
      if (Math.abs(newX - tip.mouseX) > 1 || Math.abs(newY - tip.mouseY) > 1) {
        const updated = { ...tip, mouseX: newX, mouseY: newY };
        tooltipRef.current = updated;
        setTooltip(updated);
      }
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Drag detection: primary button held + moved >5px → cancel follow & selection
      if (e.buttons === 1) {
        const dx = e.clientX - pointerDownPosRef.current.x;
        const dy = e.clientY - pointerDownPosRef.current.y;
        if (Math.hypot(dx, dy) > 5 && !wasDraggingRef.current) {
          wasDraggingRef.current = true;
          selectedCharIdRef.current = null;
          followedCharIdRef.current = null;
        }
      }

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

  const handleMouseLeave = useCallback(() => {
    tooltipRef.current = null;
    setTooltip(null);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    wasDraggingRef.current = false;
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (wasDraggingRef.current) return;
      if (isMobile) return; // Mobile uses handleTap

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

      const character = s.characters.find((c) => c.x === tileX && c.y === tileY) ?? null;
      if (character) {
        selectedCharIdRef.current = character.id;
      } else {
        selectedCharIdRef.current = null;
        followedCharIdRef.current = null;
      }
    },
    [isMobile],
  );

  const handleFollowClick = useCallback((charId: string) => {
    followedCharIdRef.current = charId;
    selectedCharIdRef.current = null;
  }, []);

  // Tap-to-inspect on mobile: show tooltip on tap, dismiss on tap empty space
  const handleTap = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      const s = stateRef.current;
      if (!canvas || !renderer || !s) return;

      const touch = e.changedTouches[0];
      if (!touch) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const { tileX, tileY } = renderer.screenToTile(
        (touch.clientX - rect.left) * scaleX,
        (touch.clientY - rect.top) * scaleY,
      );

      const character =
        s.characters.find((c) => c.x === tileX && c.y === tileY) ?? null;
      const entity =
        s.entities.find((en) => en.x === tileX && en.y === tileY) ?? null;

      if (character || entity) {
        const data: TooltipData = {
          mouseX: touch.clientX,
          mouseY: touch.clientY,
          character,
          entity,
          anchorTileX: tileX,
          anchorTileY: tileY,
        };
        tooltipRef.current = data;
        setTooltip(data);
        // Also select character for follow button
        if (character) {
          selectedCharIdRef.current = character.id;
        }
      } else {
        tooltipRef.current = null;
        setTooltip(null);
        selectedCharIdRef.current = null;
        followedCharIdRef.current = null;
      }
    },
    [],
  );

  // Initialize renderer with fixed viewport resolution
  useEffect(() => {
    if (!canvasRef.current || !overlayCanvasRef.current) return;
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    canvas.width = VIEWPORT_WIDTH;
    canvas.height = VIEWPORT_HEIGHT;

    // Size overlay canvas at the CSS display dimensions for crisp text
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    overlayCanvas.width = Math.round(rect.width * dpr);
    overlayCanvas.height = Math.round(rect.height * dpr);

    const renderer = new GameRenderer({
      canvas,
      tileSize: TILE_SIZE,
      scaleFactor: SCALE_FACTOR,
    });
    renderer.setOverlayCanvas(overlayCanvas);
    rendererRef.current = renderer;

    // Update overlay positions on every rendered frame.
    // During recording playback, also advance the renderer state.
    renderer.onFrame = () => {
      // Camera follow: keep viewport centered on the followed agent each frame
      const followId = followedCharIdRef.current;
      if (followId) {
        const visual = renderer.getVisualPosition(followId);
        if (visual) {
          renderer.camera.setCenter((visual.x + 0.5) * TILE_SIZE, (visual.y + 0.5) * TILE_SIZE);
        } else {
          followedCharIdRef.current = null;
        }
      }

      updateOverlayPositions();
      // During recording, feed the playback state to the renderer each frame
      const displayState = recActionsRef.current.getDisplayState();
      if (displayState) renderer.setState(displayState);
      recActionsRef.current.onFrame();
    };

    // Give the recording system refs to the canvases
    recActionsRef.current.setCanvas(canvas);
    recActionsRef.current.setOverlayCanvas(overlayCanvasRef.current);

    renderer.start();

    return () => {
      renderer.destroy();
      rendererRef.current = null;
      spritesLoadedRef.current = false;
      recActionsRef.current.setCanvas(null);
      recActionsRef.current.setOverlayCanvas(null);
    };
  }, [updateOverlayPositions]);

  // Reset sprite cache when version changes (new sprites uploaded)
  useEffect(() => {
    if (!rendererRef.current || !spriteVersion) return;
    rendererRef.current.clearSprites();
    spritesLoadedRef.current = false;
  }, [spriteVersion]);

  // Load sprites — re-runs when new sheets appear (e.g. new character connects).
  // SpriteCache.loadSheet() deduplicates, so already-loaded sheets are skipped.
  useEffect(() => {
    if (!rendererRef.current || !spriteBaseUrl || !state?.tileRegistry) return;

    const vSuffix = spriteVersion ? `?v=${spriteVersion}` : '';
    const sheets: Record<
      string,
      { url: string; tileSize?: number; gap?: number }
    > = {};
    for (const tile of Object.values(state.tileRegistry)) {
      if (tile.sheet && !sheets[tile.sheet]) {
        // Encode each path segment individually (preserve slashes)
        const encodedSheet = tile.sheet.split("/").map(encodeURIComponent).join("/");
        sheets[tile.sheet] = {
          url: `${spriteBaseUrl}${encodedSheet}${vSuffix}`,
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
  }, [spriteBaseUrl, spriteVersion, registrySheetCount]);

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
        isPseudoFullscreen
          ? 'pseudo-fullscreen'
          : isFullscreen
            ? 'w-full h-full'
            : 'w-full aspect-[16/9] rounded-lg'
      }`}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onTouchEnd={handleTap}
        className="block w-full h-full"
        style={{ imageRendering: 'pixelated', touchAction: 'none' }}
      />
      <canvas
        ref={overlayCanvasRef}
        className="pointer-events-none absolute inset-0 block w-full h-full"
      />
      {followButtonOverlay && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleFollowClick(followButtonOverlay.id);
          }}
          className="absolute z-50 flex h-8 w-8 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition-all hover:bg-black/80"
          style={{ left: followButtonOverlay.cssX, top: followButtonOverlay.cssY }}
          title="Follow this agent"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      )}
      <Tooltip data={tooltip} portalContainer={isFullscreen ? containerRef.current : null} />

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

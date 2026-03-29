'use client';

import type { CropRect } from '@agentic-island/game-renderer';

interface RecordingOverlayProps {
  cropRect: CropRect;
  /** Width of the game canvas in CSS pixels (container width) */
  containerWidth: number;
  /** Height of the game canvas in CSS pixels (container height) */
  containerHeight: number;
  /** Width of the game canvas in buffer pixels */
  canvasWidth: number;
  /** Height of the game canvas in buffer pixels */
  canvasHeight: number;
  isRecording: boolean;
}

/**
 * Dark overlay with a transparent crop window over the game canvas.
 * The crop rectangle is in game-canvas buffer pixels; we scale to CSS pixels.
 */
export default function RecordingOverlay({
  cropRect,
  containerWidth,
  containerHeight,
  canvasWidth,
  canvasHeight,
  isRecording,
}: RecordingOverlayProps) {
  if (canvasWidth === 0 || canvasHeight === 0) return null;

  const scaleX = containerWidth / canvasWidth;
  const scaleY = containerHeight / canvasHeight;

  const cssX = cropRect.x * scaleX;
  const cssY = cropRect.y * scaleY;
  const cssW = cropRect.width * scaleX;
  const cssH = cropRect.height * scaleY;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* SVG mask: dark around, transparent in the crop window */}
      <svg
        width={containerWidth}
        height={containerHeight}
        className="absolute inset-0"
      >
        <defs>
          <mask id="crop-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={cssX}
              y={cssY}
              width={cssW}
              height={cssH}
              fill="black"
              rx={4}
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.6)"
          mask="url(#crop-mask)"
        />
      </svg>

      {/* Border around crop window */}
      <div
        className={`absolute rounded border-2 ${
          isRecording
            ? 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]'
            : 'border-accent-cyan shadow-[0_0_12px_rgba(0,255,255,0.2)]'
        }`}
        style={{
          left: cssX,
          top: cssY,
          width: cssW,
          height: cssH,
        }}
      >
        {/* Corner markers */}
        {isRecording && (
          <div className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-red-500" />
        )}
      </div>
    </div>
  );
}

'use client';

import { RESOLUTION_PRESETS, type Resolution } from '@agentic-island/game-renderer';
import type { RecordingMode } from '@/hooks/useRecording';

interface RecordingControlsProps {
  mode: RecordingMode;
  resolution: Resolution | null;
  isLive: boolean;
  playheadOffset: number;
  bufferDuration: number;
  elapsed: number;
  onSelectResolution: (r: Resolution) => void;
  onToggleLive: () => void;
  onSetPlayheadOffset: (ms: number) => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancel: () => void;
}

function formatTime(ms: number): string {
  const secs = Math.floor(Math.abs(ms) / 1000);
  const mins = Math.floor(secs / 60);
  const s = secs % 60;
  return `${mins}:${s.toString().padStart(2, '0')}`;
}

function formatRelative(offsetMs: number, durationMs: number): string {
  const secsFromEnd = Math.round((durationMs - offsetMs) / 1000);
  if (secsFromEnd <= 0) return 'now';
  return `-${secsFromEnd}s`;
}

const CATEGORY_LABELS: Record<string, string> = {
  desktop: '🖥️ Desktop',
  mobile: '📱 Mobile',
  square: '⬜ Square',
};

function ResolutionPicker({
  onSelect,
  onCancel,
}: {
  onSelect: (r: Resolution) => void;
  onCancel: () => void;
}) {
  const grouped = RESOLUTION_PRESETS.reduce(
    (acc, r) => {
      (acc[r.category] ??= []).push(r);
      return acc;
    },
    {} as Record<string, Resolution[]>,
  );

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border-default bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-text-heading">
            Select Resolution
          </h3>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/10 hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {Object.entries(grouped).map(([category, resolutions]) => (
            <div key={category}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                {CATEGORY_LABELS[category] ?? category}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {resolutions.map((r) => (
                  <button
                    key={r.label}
                    onClick={() => onSelect(r)}
                    className="group rounded-lg border border-border-default bg-black/30 px-3 py-2.5 text-left transition-all hover:border-accent-cyan hover:bg-accent-cyan/10"
                  >
                    <span className="block text-sm font-medium text-text-primary group-hover:text-accent-cyan">
                      {r.label}
                    </span>
                    <span className="block text-xs text-text-muted">
                      {r.width} × {r.height}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineScrubber({
  playheadOffset,
  bufferDuration,
  disabled,
  onChange,
}: {
  playheadOffset: number;
  bufferDuration: number;
  disabled: boolean;
  onChange: (ms: number) => void;
}) {
  const maxVal = Math.max(bufferDuration, 1);

  return (
    <div className="flex items-center gap-3">
      <span className="w-14 text-right font-mono text-xs text-text-muted">
        {formatRelative(playheadOffset, bufferDuration)}
      </span>
      <input
        type="range"
        min={0}
        max={maxVal}
        step={100}
        value={Math.min(playheadOffset, maxVal)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-accent-cyan disabled:cursor-not-allowed disabled:opacity-40 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-cyan"
      />
      <span className="w-10 font-mono text-xs text-text-muted">now</span>
    </div>
  );
}

export default function RecordingControls({
  mode,
  resolution,
  isLive,
  playheadOffset,
  bufferDuration,
  elapsed,
  onSelectResolution,
  onToggleLive,
  onSetPlayheadOffset,
  onStartRecording,
  onStopRecording,
  onCancel,
}: RecordingControlsProps) {
  if (mode === 'selecting') {
    return (
      <ResolutionPicker
        onSelect={onSelectResolution}
        onCancel={onCancel}
      />
    );
  }

  if (mode === 'preview' || mode === 'recording') {
    return (
      <>
        {/* Top bar */}
        <div className="absolute left-0 right-0 top-0 z-50 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-4 py-3">
          <div className="flex items-center gap-2">
            {mode === 'recording' && (
              <span className="flex items-center gap-1.5 rounded bg-red-500/20 px-2 py-1 text-xs font-bold text-red-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                REC {formatTime(elapsed)}
              </span>
            )}
            {resolution && (
              <span className="rounded bg-white/10 px-2 py-1 text-xs text-text-muted">
                {resolution.width}×{resolution.height}
              </span>
            )}
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-white/20"
          >
            Cancel
          </button>
        </div>

        {/* Bottom bar */}
        <div className="absolute bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-8">
          {/* Timeline (only when paused, or during buffer-playback recording — hidden when live) */}
          {!isLive && (
            <div className="mb-3">
              <TimelineScrubber
                playheadOffset={playheadOffset}
                bufferDuration={bufferDuration}
                disabled={mode === 'recording'}
                onChange={onSetPlayheadOffset}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-3">
            {/* Live / Pause toggle (only in preview) */}
            {mode === 'preview' && (
              <button
                onClick={onToggleLive}
                className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                  isLive
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                    : 'bg-white/10 text-text-primary hover:bg-white/20'
                }`}
              >
                {isLive ? '● LIVE — Click to pause' : '⏸ PAUSED — Scrub timeline'}
              </button>
            )}

            {/* Record button (in preview mode — both live and paused) */}
            {mode === 'preview' && (
              <button
                onClick={onStartRecording}
                className="flex items-center gap-2 rounded-full bg-red-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-red-600 hover:shadow-red-500/25"
              >
                <span className="h-3 w-3 rounded-full bg-white" />
                {isLive ? 'Start Recording' : 'Record from here'}
              </button>
            )}

            {/* Stop button (during recording) */}
            {mode === 'recording' && (
              <button
                onClick={onStopRecording}
                className="flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-black shadow-lg transition-all hover:bg-gray-200"
              >
                <span className="h-3 w-3 rounded-sm bg-red-500" />
                Stop Recording
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  return null;
}

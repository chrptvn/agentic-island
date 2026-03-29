'use client';

import { useRef, useState, useCallback } from 'react';
import {
  StateBuffer,
  VideoRecorder,
  computeCropRect,
  isRecordingSupported,
  type Resolution,
  type CropRect,
} from '@agentic-island/game-renderer';
import type { IslandState } from '@agentic-island/shared';

export type RecordingMode =
  | 'idle'
  | 'selecting'
  | 'preview'
  | 'recording'
  | 'saving';

export interface RecordingState {
  mode: RecordingMode;
  resolution: Resolution | null;
  cropRect: CropRect | null;
  /** True = showing live feed, false = paused / scrubbing the buffer */
  isLive: boolean;
  /** Current playback position as ms offset from buffer start (0 = oldest) */
  playheadOffset: number;
  /** Total buffered duration in ms */
  bufferDuration: number;
  blob: Blob | null;
  elapsed: number;
  supported: boolean;
}

export interface RecordingActions {
  openRecordMode: () => void;
  selectResolution: (resolution: Resolution) => void;
  /** Toggle between live feed and paused/scrub mode. */
  toggleLive: () => void;
  /** Set the playhead position (ms offset from buffer start). */
  setPlayheadOffset: (offsetMs: number) => void;
  startRecording: () => void;
  stopRecording: () => void;
  dismiss: () => void;
  cancel: () => void;
  pushState: (state: IslandState) => void;
  /**
   * Returns the buffered state to render, or null to use live state.
   */
  getDisplayState: () => IslandState | null;
  /** Call on each rendered frame (drives video capture + playback). */
  onFrame: () => void;
  setCanvas: (canvas: HTMLCanvasElement | null) => void;
}

const STATE_BUFFER_SIZE = 120;

export function useRecording(): [RecordingState, RecordingActions] {
  const bufferRef = useRef(new StateBuffer(STATE_BUFFER_SIZE));
  const recorderRef = useRef<VideoRecorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Playback state stored in refs so onFrame can access without stale closures
  const playbackStartRealTime = useRef(0);
  const playbackStartBufferTime = useRef(0);
  const playbackEndBufferTime = useRef(0);
  const isRecordingRef = useRef(false);
  /** True when recording the live feed (no playback / no auto-stop). */
  const recordingFromLiveRef = useRef(false);

  const [mode, setMode] = useState<RecordingMode>('idle');
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [playheadOffset, setPlayheadOffset] = useState(0);
  const [bufferDuration, setBufferDuration] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const supported = isRecordingSupported();

  const refreshBufferDuration = useCallback(() => {
    setBufferDuration(bufferRef.current.duration());
  }, []);

  const openRecordMode = useCallback(() => {
    if (!supported) return;
    setMode('selecting');
  }, [supported]);

  const selectResolution = useCallback((res: Resolution) => {
    setResolution(res);
    const canvas = canvasRef.current;
    if (canvas) {
      setCropRect(
        computeCropRect(canvas.width, canvas.height, res.width, res.height),
      );
    }
    setIsLive(true);
    setPlayheadOffset(0);
    refreshBufferDuration();
    setMode('preview');
  }, [refreshBufferDuration]);

  const toggleLive = useCallback(() => {
    setIsLive((prev) => {
      if (prev) {
        // Pausing — snapshot the playhead at the newest position
        refreshBufferDuration();
        setPlayheadOffset(bufferRef.current.duration());
      }
      return !prev;
    });
  }, [refreshBufferDuration]);

  const setPlayheadOffsetAction = useCallback((offsetMs: number) => {
    refreshBufferDuration();
    const dur = bufferRef.current.duration();
    setPlayheadOffset(Math.max(0, Math.min(dur, offsetMs)));
  }, [refreshBufferDuration]);

  const doStop = useCallback(async () => {
    isRecordingRef.current = false;
    const rec = recorderRef.current;
    if (!rec) return;

    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }

    try {
      const videoBlob = await rec.stop();
      setBlob(videoBlob);
      setMode('saving');
    } catch {
      setMode('idle');
    }

    rec.destroy();
    recorderRef.current = null;
  }, []);

  const startRecording = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !resolution || !cropRect) return;

    const rec = new VideoRecorder(resolution, cropRect);
    rec.start(canvas);
    recorderRef.current = rec;
    isRecordingRef.current = true;

    if (isLive) {
      // Recording from live — capture the live feed, no playback tracking
      recordingFromLiveRef.current = true;
    } else {
      // Recording from paused — replay buffered states, auto-stop at end
      recordingFromLiveRef.current = false;

      const buffer = bufferRef.current;
      const oldest = buffer.getOldest();
      const newest = buffer.getNewest();
      if (!oldest || !newest) return;

      const startTs = oldest.timestamp + playheadOffset;
      const endTs = newest.timestamp;
      if (startTs >= endTs) return;

      playbackStartRealTime.current = performance.now();
      playbackStartBufferTime.current = startTs;
      playbackEndBufferTime.current = endTs;
    }

    setElapsed(0);
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(rec.elapsed);
      // Advance timeline playhead during buffer playback recording
      if (!recordingFromLiveRef.current) {
        const realElapsed = performance.now() - playbackStartRealTime.current;
        const currentTs = playbackStartBufferTime.current + realElapsed;
        const oldestEntry = bufferRef.current.getOldest();
        if (oldestEntry) {
          setPlayheadOffset(Math.min(currentTs - oldestEntry.timestamp, bufferRef.current.duration()));
        }
      }
    }, 200);
    setMode('recording');
  }, [resolution, cropRect, playheadOffset, isLive]);

  const stopRecording = useCallback(() => {
    doStop();
  }, [doStop]);

  const dismiss = useCallback(() => {
    setBlob(null);
    setResolution(null);
    setCropRect(null);
    setIsLive(true);
    setPlayheadOffset(0);
    setElapsed(0);
    setMode('idle');
  }, []);

  const cancel = useCallback(() => {
    isRecordingRef.current = false;
    recordingFromLiveRef.current = false;
    const rec = recorderRef.current;
    if (rec) {
      rec.destroy();
      recorderRef.current = null;
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    setBlob(null);
    setResolution(null);
    setCropRect(null);
    setIsLive(true);
    setPlayheadOffset(0);
    setElapsed(0);
    setMode('idle');
  }, []);

  const pushState = useCallback((state: IslandState) => {
    bufferRef.current.push(state);
  }, []);

  const getDisplayState = useCallback((): IslandState | null => {
    // Live mode or idle — use live state from props
    if (isLive && mode !== 'recording') return null;

    // Recording from live — use live state, not buffer playback
    if (mode === 'recording' && recordingFromLiveRef.current) return null;

    const buffer = bufferRef.current;
    const oldest = buffer.getOldest();
    if (!oldest) return null;

    if (mode === 'recording') {
      // During buffer-playback recording, compute current playback position
      const realElapsed = performance.now() - playbackStartRealTime.current;
      const currentTs = playbackStartBufferTime.current + realElapsed;
      const entry = buffer.getAt(currentTs);
      return entry?.state ?? null;
    }

    // Preview + paused — show state at playhead
    const targetTs = oldest.timestamp + playheadOffset;
    const entry = buffer.getAt(targetTs);
    return entry?.state ?? null;
  }, [isLive, mode, playheadOffset]);

  const onFrame = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec?.isRecording || !isRecordingRef.current) return;

    // When recording from live, just capture — no auto-stop
    if (recordingFromLiveRef.current) {
      rec.renderFrame();
      return;
    }

    // Buffer-playback recording — check if we reached the end
    const realElapsed = performance.now() - playbackStartRealTime.current;
    const currentTs = playbackStartBufferTime.current + realElapsed;

    if (currentTs >= playbackEndBufferTime.current) {
      rec.renderFrame(); // capture final frame
      doStop();
      return;
    }

    rec.renderFrame();
  }, [doStop]);

  const setCanvas = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      canvasRef.current = canvas;
      if (canvas && resolution) {
        setCropRect(
          computeCropRect(canvas.width, canvas.height, resolution.width, resolution.height),
        );
      }
    },
    [resolution],
  );

  const state: RecordingState = {
    mode,
    resolution,
    cropRect,
    isLive,
    playheadOffset,
    bufferDuration,
    blob,
    elapsed,
    supported,
  };

  const actions: RecordingActions = {
    openRecordMode,
    selectResolution,
    toggleLive,
    setPlayheadOffset: setPlayheadOffsetAction,
    startRecording,
    stopRecording,
    dismiss,
    cancel,
    pushState,
    getDisplayState,
    onFrame,
    setCanvas,
  };

  return [state, actions];
}

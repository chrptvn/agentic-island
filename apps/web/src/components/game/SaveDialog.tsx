'use client';

import { useEffect, useMemo, useRef } from 'react';

interface SaveDialogProps {
  blob: Blob;
  onDismiss: () => void;
}

export default function SaveDialog({ blob, onDismiss }: SaveDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const url = useMemo(() => URL.createObjectURL(blob), [blob]);

  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    a.download = `island-clip-${timestamp}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border-default bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-text-heading">
            Recording Complete
          </h3>
          <button
            onClick={onDismiss}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-white/10 hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        {/* Video preview */}
        {url && (
          <video
            ref={videoRef}
            src={url}
            controls
            autoPlay
            loop
            muted
            className="mb-4 w-full rounded-lg bg-black"
            style={{ maxHeight: 300 }}
          />
        )}

        {/* Metadata */}
        <div className="mb-4 flex items-center gap-4 text-xs text-text-muted">
          <span>📦 {sizeMB} MB</span>
          <span>🎬 WebM</span>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleDownload}
            className="flex-1 rounded-lg bg-accent-cyan px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-accent-cyan/80"
          >
            ⬇ Download
          </button>
          <button
            onClick={onDismiss}
            className="rounded-lg bg-white/10 px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/20"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

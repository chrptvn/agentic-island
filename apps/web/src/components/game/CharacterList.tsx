'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface CharacterListProps {
  characters: Array<{ id: string }>;
  onSelect: (charId: string) => void;
  isMobile?: boolean;
}

export default function CharacterList({ characters, onSelect, isMobile }: CharacterListProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
      setOpen(false);
    },
    [onSelect],
  );

  if (characters.length === 0) return null;

  return (
    <div ref={containerRef} className="absolute right-3 top-14 z-20">
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded-lg bg-black/50 p-2 text-white/70 transition-all hover:bg-black/70 hover:text-white ${
          isMobile ? 'min-h-[44px] min-w-[44px] flex items-center justify-center' : ''
        }`}
        title="Find character"
      >
        {/* Person icon */}
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
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div className="mt-1 max-h-60 w-48 overflow-y-auto rounded-lg bg-black/80 py-1 shadow-lg backdrop-blur-sm">
          {characters.map((c) => (
            <button
              key={c.id}
              onClick={() => handleSelect(c.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-green-400" />
              <span className="truncate">{c.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

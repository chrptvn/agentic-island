'use client';

import { useState, useCallback, useEffect } from 'react';

interface FullscreenAPI {
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  isPseudoFullscreen: boolean;
}

const PSEUDO_FULLSCREEN_CLASS = 'pseudo-fullscreen';

function getFullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  return (
    document.fullscreenElement ??
    (document as unknown as { webkitFullscreenElement?: Element })
      .webkitFullscreenElement ??
    null
  );
}

function supportsNativeFullscreen(el: HTMLElement): boolean {
  return typeof el.requestFullscreen === 'function' ||
    typeof (el as unknown as { webkitRequestFullscreen?: () => void })
      .webkitRequestFullscreen === 'function';
}

function tryLockLandscape() {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: string) => Promise<void>;
    };
    orientation.lock?.('landscape')?.catch(() => {});
  } catch {
    // orientation lock not supported
  }
}

function tryUnlockOrientation() {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      unlock?: () => void;
    };
    orientation.unlock?.();
  } catch {
    // orientation unlock not supported
  }
}

export function useFullscreen(
  ref: React.RefObject<HTMLElement | null>,
): FullscreenAPI {
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);

  const enterFullscreen = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const activatePseudo = () => {
      el.classList.add(PSEUDO_FULLSCREEN_CLASS);
      setPseudoFullscreen(true);
      tryLockLandscape();
    };

    // Try native fullscreen; fall back to pseudo if it rejects (e.g. iOS
    // Safari where requestFullscreen exists but only works on <video>).
    if (supportsNativeFullscreen(el)) {
      const webkitEl = el as unknown as { webkitRequestFullscreen?: () => void };
      if (typeof el.requestFullscreen === 'function') {
        el.requestFullscreen()
          .then(() => tryLockLandscape())
          .catch(() => activatePseudo());
      } else if (webkitEl.webkitRequestFullscreen) {
        webkitEl.webkitRequestFullscreen();
        // webkit variant doesn't return a promise — check after a tick
        setTimeout(() => {
          if (!getFullscreenElement()) activatePseudo();
          else tryLockLandscape();
        }, 100);
      } else {
        activatePseudo();
      }
    } else {
      activatePseudo();
    }
  }, [ref]);

  const exitFullscreen = useCallback(() => {
    if (getFullscreenElement()) {
      const webkitDoc = document as unknown as {
        webkitExitFullscreen?: () => void;
      };
      if (typeof document.exitFullscreen === 'function') {
        document.exitFullscreen().catch(() => {});
      } else {
        webkitDoc.webkitExitFullscreen?.();
      }
    }

    if (pseudoFullscreen && ref.current) {
      ref.current.classList.remove(PSEUDO_FULLSCREEN_CLASS);
      setPseudoFullscreen(false);
    }

    tryUnlockOrientation();
  }, [pseudoFullscreen, ref]);

  const toggleFullscreen = useCallback(() => {
    if (nativeFullscreen || pseudoFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [nativeFullscreen, pseudoFullscreen, enterFullscreen, exitFullscreen]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = !!getFullscreenElement();
      setNativeFullscreen(active);
      if (!active) tryUnlockOrientation();
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  return {
    isFullscreen: nativeFullscreen || pseudoFullscreen,
    toggleFullscreen,
    enterFullscreen,
    exitFullscreen,
    isPseudoFullscreen: pseudoFullscreen,
  };
}

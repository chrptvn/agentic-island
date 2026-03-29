'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface FullscreenAPI {
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  enterFullscreen: () => void;
  exitFullscreen: () => void;
  isPseudoFullscreen: boolean;
}


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

// Detect iOS/iPadOS — native fullscreen never works on these.
// Covers: iPhone UA, iPad UA, iPad in desktop mode (MacIntel + touch),
// and the "standalone" property which only exists on iOS WebKit.
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPad in desktop mode reports as Mac but has touch
  if (navigator.maxTouchPoints > 1 &&
    (/Macintosh|MacIntel/.test(navigator.userAgent) || navigator.platform === 'MacIntel')) return true;
  // "standalone" property is iOS-only (PWA home screen detection)
  if ('standalone' in navigator) return true;
  return false;
}

function lockBodyScroll() {
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}

function unlockBodyScroll() {
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
}

// Set a CSS variable with the real viewport height from JS.
// iOS Safari's 100vh/100dvh can be unreliable with the dynamic address bar;
// window.innerHeight always reflects the actual visible area.
function syncViewportHeight() {
  document.documentElement.style.setProperty(
    '--pseudo-fs-height',
    `${window.innerHeight}px`,
  );
}

function clearViewportHeight() {
  document.documentElement.style.removeProperty('--pseudo-fs-height');
}

export function useFullscreen(
  ref: React.RefObject<HTMLElement | null>,
): FullscreenAPI {
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const resizeListenerRef = useRef<(() => void) | null>(null);

  const enterFullscreen = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const activatePseudo = () => {
      syncViewportHeight();
      lockBodyScroll();
      setPseudoFullscreen(true);

      // Keep viewport height in sync (address bar show/hide triggers resize)
      const onResize = () => syncViewportHeight();
      window.addEventListener('resize', onResize);
      resizeListenerRef.current = onResize;
    };

    // iOS: skip native fullscreen entirely — it doesn't work on non-<video>.
    if (isIOS()) {
      activatePseudo();
      return;
    }

    // Try native fullscreen; fall back to pseudo if it rejects.
    if (supportsNativeFullscreen(el)) {
      const webkitEl = el as unknown as { webkitRequestFullscreen?: () => void };
      if (typeof el.requestFullscreen === 'function') {
        el.requestFullscreen().catch(() => activatePseudo());
      } else if (webkitEl.webkitRequestFullscreen) {
        webkitEl.webkitRequestFullscreen();
        setTimeout(() => {
          if (!getFullscreenElement()) activatePseudo();
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
      unlockBodyScroll();
      clearViewportHeight();
      setPseudoFullscreen(false);

      if (resizeListenerRef.current) {
        window.removeEventListener('resize', resizeListenerRef.current);
        resizeListenerRef.current = null;
      }
    }
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
      setNativeFullscreen(!!getFullscreenElement());
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  // Cleanup resize listener on unmount
  useEffect(() => {
    return () => {
      if (resizeListenerRef.current) {
        window.removeEventListener('resize', resizeListenerRef.current);
      }
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

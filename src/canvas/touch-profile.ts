import { useEffect, useState } from 'react';

/** Shorter long-press on touch-first devices. */
export const TOUCH_LONG_PRESS_MS = 350;
export const DESKTOP_LONG_PRESS_MS = 500;

/** True when the primary input is coarse (touch-first tablets / phones). */
export function detectTouchNavigationProfile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export function useTouchNavigationProfile(): boolean {
  const [active, setActive] = useState(detectTouchNavigationProfile);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const onChange = () => setActive(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return active;
}

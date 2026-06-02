import { useEffect } from 'react';
import {
  isPenBarrelPressEvent,
  isPenPointer,
  PEN_DOUBLE_BARREL_MS,
  PEN_SQUEEZE_HOLD_MS,
} from './pen-input';

type PenBarrelGestureOptions = {
  enabled: boolean;
  /** Hold barrel (squeeze) → temporary pan. */
  onSqueezeStart?: () => void;
  onSqueezeEnd?: () => void;
  /** Two quick barrel presses → toggle select / hand. */
  onDoubleBarrelTap?: () => void;
};

/**
 * Apple Pencil barrel / squeeze gestures via Pointer Events (Safari on iPad).
 * Native Pencil double-tap and squeeze are not exposed as separate DOM events; WebKit
 * often maps them to barrel-button pointerdown/up instead.
 */
export function usePenBarrelGesture({
  enabled,
  onSqueezeStart,
  onSqueezeEnd,
  onDoubleBarrelTap,
}: PenBarrelGestureOptions): void {
  useEffect(() => {
    if (!enabled) return;

    let squeezeActive = false;
    let squeezeHoldTimer: number | null = null;
    let lastBarrelTapAt = 0;

    const clearHoldTimer = () => {
      if (squeezeHoldTimer != null) {
        window.clearTimeout(squeezeHoldTimer);
        squeezeHoldTimer = null;
      }
    };

    const endSqueeze = () => {
      clearHoldTimer();
      if (!squeezeActive) return;
      squeezeActive = false;
      onSqueezeEnd?.();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!isPenBarrelPressEvent(e)) return;

      const now = Date.now();
      if (now - lastBarrelTapAt <= PEN_DOUBLE_BARREL_MS) {
        clearHoldTimer();
        endSqueeze();
        lastBarrelTapAt = 0;
        onDoubleBarrelTap?.();
        return;
      }

      lastBarrelTapAt = now;
      clearHoldTimer();
      squeezeHoldTimer = window.setTimeout(() => {
        squeezeHoldTimer = null;
        if (!squeezeActive) {
          squeezeActive = true;
          onSqueezeStart?.();
        }
      }, PEN_SQUEEZE_HOLD_MS);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isPenPointer(e.pointerType)) return;
      if (squeezeActive || squeezeHoldTimer != null) {
        endSqueeze();
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (!isPenPointer(e.pointerType)) return;
      endSqueeze();
    };

    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointerup', onPointerUp, { capture: true });
    window.addEventListener('pointercancel', onPointerCancel, { capture: true });

    return () => {
      endSqueeze();
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointerup', onPointerUp, { capture: true });
      window.removeEventListener('pointercancel', onPointerCancel, { capture: true });
    };
  }, [enabled, onDoubleBarrelTap, onSqueezeEnd, onSqueezeStart]);
}

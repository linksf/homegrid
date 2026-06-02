import { useCallback, useRef, type MouseEvent, type PointerEvent } from 'react';
import type { ContextMenuTarget } from './context-menu-target';

import { DESKTOP_LONG_PRESS_MS } from '../canvas/touch-profile';

const LONG_PRESS_MOVE_TOLERANCE_PX = 8;

export type ContextMenuBindHandlers = {
  onContextMenu?: (e: MouseEvent) => void;
  onPointerDown?: (e: PointerEvent) => void;
  onPointerMove?: (e: PointerEvent) => void;
  onPointerUp?: (e: PointerEvent) => void;
  onPointerCancel?: (e: PointerEvent) => void;
};

type ContextMenuCallback = (target: ContextMenuTarget, clientX: number, clientY: number) => void;

type ContextMenuGestureOptions = {
  longPressMs?: number;
  /** When set, long-press opens the unified overlap picker at the pointer. */
  onLongPressAt?: (clientX: number, clientY: number) => void;
};

export function useEntityContextMenuGesture(
  onOpen: ContextMenuCallback,
  options: ContextMenuGestureOptions = {},
): {
  bind: (target: ContextMenuTarget) => ContextMenuBindHandlers;
} {
  const longPressMs = options.longPressMs ?? DESKTOP_LONG_PRESS_MS;
  const onLongPressAt = options.onLongPressAt;
  const timerRef = useRef<number | null>(null);
  const targetRef = useRef<ContextMenuTarget | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    targetRef.current = null;
    startRef.current = null;
  }, []);

  const bind = useCallback(
    (target: ContextMenuTarget): ContextMenuBindHandlers => ({
      onContextMenu: (e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen(target, e.clientX, e.clientY);
      },
      onPointerDown: (e) => {
        if (e.button !== 0) return;
        clearTimer();
        targetRef.current = target;
        startRef.current = { x: e.clientX, y: e.clientY };
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          const t = targetRef.current;
          const start = startRef.current;
          targetRef.current = null;
          startRef.current = null;
          if (!start) return;
          if (onLongPressAt) {
            onLongPressAt(start.x, start.y);
            return;
          }
          if (!t) return;
          onOpen(t, start.x, start.y);
        }, longPressMs);
      },
      onPointerMove: (e) => {
        if (!startRef.current) return;
        const dx = e.clientX - startRef.current.x;
        const dy = e.clientY - startRef.current.y;
        if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) {
          clearTimer();
        }
      },
      onPointerUp: () => {
        clearTimer();
      },
      onPointerCancel: () => {
        clearTimer();
      },
    }),
    [clearTimer, longPressMs, onLongPressAt, onOpen],
  );

  return { bind };
}

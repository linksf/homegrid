import { useEffect, useLayoutEffect, useRef, type JSX } from 'react';
import type { ContextMenuTarget } from '../editor/context-menu-target';
import { contextMenuTargetKey } from '../editor/context-menu-target-key';

export type PickMenuItem = {
  target: ContextMenuTarget;
  label: string;
};

type PickMenuProps = {
  x: number;
  y: number;
  items: PickMenuItem[];
  onPick: (target: ContextMenuTarget) => void;
  onClose: () => void;
};

export function PickMenu({ x, y, items, onPick, onClose }: PickMenuProps): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, items]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onPointerDown(e: PointerEvent) {
      const el = menuRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onClose]);

  if (items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="pick-menu"
      role="menu"
      aria-label="Choose item"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p className="pick-menu__title">Choose item</p>
      {items.map((item) => (
        <button
          key={contextMenuTargetKey(item.target)}
          type="button"
          role="menuitem"
          className="pick-menu__item"
          onClick={() => {
            onPick(item.target);
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

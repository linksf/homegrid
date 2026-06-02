import { useEffect, useLayoutEffect, useRef, type JSX } from 'react';
import type { ContextMenuAction } from '../editor/context-menu-actions';

type ContextMenuProps = {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onAction: (actionId: string) => void;
  onClose: () => void;
};

export function ContextMenu({ x, y, actions, onAction, onClose }: ContextMenuProps): JSX.Element | null {
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
  }, [x, y, actions]);

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

  if (actions.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          className={[
            'context-menu__item',
            action.danger ? 'context-menu__item--danger' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={action.disabled}
          onClick={() => {
            if (action.disabled) return;
            onAction(action.id);
            onClose();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

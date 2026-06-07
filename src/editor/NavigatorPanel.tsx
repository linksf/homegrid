import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FitBounds } from '../canvas/viewport-fit';
import {
  ancestorPath,
  buildNavigatorTree,
  findNavigatorNode,
  type NavigatorNode,
  type NavigatorNodeKind,
} from './navigator-tree';
import type { Job } from '../domain/types';

type NavigatorPanelProps = {
  job: Job;
  activeNodeId: string | null;
  onSelectNode: (node: NavigatorNode) => void;
  onZoomToBounds: (bounds: FitBounds) => void;
};

function kindIcon(kind: NavigatorNodeKind): string {
  switch (kind) {
    case 'floorplan':
      return '⌂';
    case 'area':
      return '▢';
    case 'room':
      return '▦';
    case 'junctionBox':
      return '□';
    case 'hub':
      return '⊕';
    case 'cable':
      return '⏤';
    case 'lightBulb':
      return '💡';
    case 'switch':
      return 'S';
    case 'dimmerSwitch':
      return 'D';
    case 'outlet':
      return 'O';
    case 'deviceNode':
      return '◉';
    case 'wire':
      return '—';
    case 'wireLink':
      return '↔';
    case 'conduitRun':
      return '⟷';
    case 'unassigned':
      return '?';
    default:
      return '•';
  }
}

type TreeRowProps = {
  node: NavigatorNode;
  depth: number;
  expanded: Set<string>;
  activeNodeId: string | null;
  onToggle: (id: string) => void;
  onSelect: (node: NavigatorNode) => void;
};

function TreeRow({ node, depth, expanded, activeNodeId, onToggle, onSelect }: TreeRowProps): JSX.Element {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isActive = activeNodeId === node.id;

  return (
    <>
      <li className={['navigator-tree__row', isActive ? 'navigator-tree__row--active' : ''].filter(Boolean).join(' ')}>
        {hasChildren ? (
          <button
            type="button"
            className="navigator-tree__toggle"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            onClick={() => onToggle(node.id)}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="navigator-tree__toggle-spacer" aria-hidden />
        )}
        <button
          type="button"
          className="navigator-tree__label"
          style={{ paddingLeft: `${depth * 0.65}rem` }}
          onClick={() => onSelect(node)}
        >
          <span className="navigator-tree__icon" aria-hidden>
            {kindIcon(node.kind)}
          </span>
          {node.label}
        </button>
      </li>
      {hasChildren && isExpanded
        ? node.children.map((child) => (
            <TreeBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              activeNodeId={activeNodeId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))
        : null}
    </>
  );
}

function TreeBranch(props: TreeRowProps): JSX.Element {
  return <TreeRow {...props} />;
}

export function NavigatorPanel({ job, activeNodeId, onSelectNode, onZoomToBounds }: NavigatorPanelProps): JSX.Element {
  const tree = useMemo(() => buildNavigatorTree(job), [job]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([tree.id]));
  const [open, setOpen] = useState(false);
  const treeRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(tree.id);
      return next;
    });
  }, [tree.id]);

  function handleToggle(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelect(node: NavigatorNode): void {
    onSelectNode(node);
    const path = ancestorPath(tree, node.id);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of path) next.add(id);
      return next;
    });
    if (node.bounds) onZoomToBounds(node.bounds);
  }

  function handleTreeKeyDown(e: React.KeyboardEvent<HTMLUListElement>): void {
    const rows = treeRef.current?.querySelectorAll<HTMLButtonElement>('.navigator-tree__label');
    if (!rows || rows.length === 0) return;
    const buttons = [...rows];
    const active = document.activeElement;
    const index = buttons.findIndex((btn) => btn === active);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = buttons[Math.min(index + 1, buttons.length - 1)] ?? buttons[0];
      next?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = buttons[Math.max(index - 1, 0)] ?? buttons[buttons.length - 1];
      prev?.focus();
    } else if (e.key === 'Enter' && active instanceof HTMLButtonElement && active.classList.contains('navigator-tree__label')) {
      e.preventDefault();
      active.click();
    }
  }

  const activeNode = activeNodeId ? findNavigatorNode(tree, activeNodeId) : null;

  return (
    <aside
      className={['navigator-rail', open ? 'navigator-rail--open' : 'navigator-rail--collapsed']
        .filter(Boolean)
        .join(' ')}
      aria-label="Navigator"
    >
      <button
        type="button"
        className="navigator-rail__toggle"
        aria-expanded={open}
        aria-controls="navigator-panel-content"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="navigator-rail__toggle-icon" aria-hidden />
        <span className="navigator-rail__toggle-label">{open ? 'Hide navigator' : 'Navigator'}</span>
      </button>

      <div id="navigator-panel-content" className="navigator-panel">
        <header className="navigator-panel__header">
          <h2 className="navigator-panel__title">Navigator</h2>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => handleSelect(tree)}
            title="Show entire floor plan"
          >
            Fit all
          </button>
        </header>
        <ul
          ref={treeRef}
          className="navigator-tree"
          role="tree"
          tabIndex={0}
          onKeyDown={handleTreeKeyDown}
        >
          <TreeRow
            node={tree}
            depth={0}
            expanded={expanded}
            activeNodeId={activeNode?.id ?? activeNodeId}
            onToggle={handleToggle}
            onSelect={handleSelect}
          />
        </ul>
      </div>
    </aside>
  );
}

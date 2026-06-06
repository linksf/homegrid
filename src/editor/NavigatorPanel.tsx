import type { JSX } from 'react';
import { useMemo, useState } from 'react';
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
    case 'lightBulb':
      return '💡';
    case 'switch':
      return 'S';
    case 'dimmerSwitch':
      return 'D';
    case 'outlet':
      return 'O';
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
      next.add(node.id);
      return next;
    });
    if (node.bounds) onZoomToBounds(node.bounds);
  }

  const activeNode = activeNodeId ? findNavigatorNode(tree, activeNodeId) : null;

  return (
    <aside className="navigator-panel" aria-label="Navigator">
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
      <ul className="navigator-tree">
        <TreeRow
          node={tree}
          depth={0}
          expanded={expanded}
          activeNodeId={activeNode?.id ?? activeNodeId}
          onToggle={handleToggle}
          onSelect={handleSelect}
        />
      </ul>
    </aside>
  );
}

import type { Diagram } from '../domain/types';

export type ApplyDiagramOptions = {
  /** When false, batches changes until commitDiagramHistory (e.g. while dragging). Default true. */
  history?: boolean;
};

export type ApplyDiagramFn = (
  mutator: (diagram: Diagram) => Diagram,
  options?: ApplyDiagramOptions,
) => void;

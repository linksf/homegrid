import type { JSX } from 'react';
import { JOB_FILE_EXT } from '../app-brand';
import type { Diagram, ResolvedWire } from '../domain/types';
import {
  collectDiagramIssues,
  directionConflictIssues,
  opposedFlowIssues,
  type DiagramIssue,
} from './diagram-issues';

type IssuesPanelProps = {
  diagram: Diagram;
  resolvedByWireId: Map<string, ResolvedWire>;
  selectedWireId: string | null;
  selectedLinkId: string | null;
  onSelectIssue: (issue: DiagramIssue) => void;
  onExport: () => void;
  onExportSvg?: () => void;
  onExportPng?: () => void;
  onBack: () => void;
};

function issueSelected(
  issue: DiagramIssue,
  selectedWireId: string | null,
  selectedLinkId: string | null,
): boolean {
  if (issue.kind === 'direction-conflict') return selectedWireId === issue.wireId;
  return selectedLinkId === issue.linkId;
}

export function IssuesPanel({
  diagram,
  resolvedByWireId,
  selectedWireId,
  selectedLinkId,
  onSelectIssue,
  onExport,
  onExportSvg,
  onExportPng,
  onBack,
}: IssuesPanelProps): JSX.Element {
  const allIssues = collectDiagramIssues(diagram, resolvedByWireId);
  const directionIssues = directionConflictIssues(allIssues);
  const flowIssues = opposedFlowIssues(allIssues);

  return (
    <section className="issues-panel" aria-label="Issues">
      <div className="issues-panel__header">
        <h3 className="issues-panel__title">Issues</h3>
        <div className="issues-panel__actions">
          <button type="button" className="btn btn--small" onClick={onExport}>
            Export .{JOB_FILE_EXT}
          </button>
          {onExportSvg ? (
            <button type="button" className="btn btn--small" onClick={onExportSvg}>
              Export SVG
            </button>
          ) : null}
          {onExportPng ? (
            <button type="button" className="btn btn--small" onClick={onExportPng}>
              Export PNG
            </button>
          ) : null}
          <button type="button" className="btn btn--small" onClick={onBack}>
            Home
          </button>
        </div>
      </div>

      <div className="issues-panel__body">
        <div className="issues-panel__block">
          <h4 className="issues-panel__subtitle">Direction conflicts</h4>
          <p className="issues-panel__hint">
            Only wires directly involved in a mismatch are listed — not every wire on the same circuit.
          </p>
          {directionIssues.length === 0 ? (
            <p className="issues-panel__empty">None</p>
          ) : (
            <ul className="issues-panel__list">
              {directionIssues.map((issue) => (
                <li key={issue.wireId}>
                  <button
                    type="button"
                    className={[
                      'issues-panel__row',
                      issueSelected(issue, selectedWireId, selectedLinkId)
                        ? 'issues-panel__row--selected'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSelectIssue(issue)}
                  >
                    <span className="issues-panel__row-text">
                      <span className="issues-panel__row-label">{issue.title}</span>
                      <span className="issues-panel__row-detail">{issue.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="issues-panel__block">
          <h4 className="issues-panel__subtitle">Opposing flow at connections</h4>
          <p className="issues-panel__hint">
            Both linked wires show current flowing into the splice (not out of it).
          </p>
          {flowIssues.length === 0 ? (
            <p className="issues-panel__empty">None</p>
          ) : (
            <ul className="issues-panel__list">
              {flowIssues.map((issue) => (
                <li key={issue.linkId}>
                  <button
                    type="button"
                    className={[
                      'issues-panel__row',
                      issueSelected(issue, selectedWireId, selectedLinkId)
                        ? 'issues-panel__row--selected'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSelectIssue(issue)}
                  >
                    <span className="issues-panel__row-text">
                      <span className="issues-panel__row-label">{issue.title}</span>
                      <span className="issues-panel__row-detail">{issue.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

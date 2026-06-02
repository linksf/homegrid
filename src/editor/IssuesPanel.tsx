import type { JSX } from 'react';
import { JOB_FILE_EXT } from '../app-brand';
import type { Diagram, ResolvedWire } from '../domain/types';
import { isDirectionOpposedLink } from '../domain/wire-link-utils';

function wireTitle(diagram: Diagram, wireId: string): string {
  const w = diagram.wires.find((x) => x.id === wireId);
  if (!w) return wireId;
  const label = w.label.trim();
  return label.length > 0 ? label : `${w.color} wire`;
}

type IssuesPanelProps = {
  diagram: Diagram;
  resolvedByWireId: Map<string, ResolvedWire>;
  selectedWireId: string | null;
  selectedLinkId: string | null;
  onSelectWire: (wireId: string) => void;
  onSelectLink: (linkId: string) => void;
  onExport: () => void;
  onExportSvg?: () => void;
  onExportPng?: () => void;
  onBack: () => void;
};

export function IssuesPanel({
  diagram,
  resolvedByWireId,
  selectedWireId,
  selectedLinkId,
  onSelectWire,
  onSelectLink,
  onExport,
  onExportSvg,
  onExportPng,
  onBack,
}: IssuesPanelProps): JSX.Element {
  const conflictWires = diagram.wires
    .filter((w) => resolvedByWireId.get(w.id)?.directionConflict)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  const opposedLinks = diagram.wireLinks
    .filter((link) =>
      isDirectionOpposedLink(
        link,
        resolvedByWireId.get(link.wireIdA),
        resolvedByWireId.get(link.wireIdB),
      ),
    )
    .slice();

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

      <div className="issues-panel__block">
        <h4 className="issues-panel__subtitle">Direction conflicts</h4>
        {conflictWires.length === 0 ? (
          <p className="issues-panel__empty">None</p>
        ) : (
          <ul className="issues-panel__list">
            {conflictWires.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className={[
                    'issues-panel__row',
                    selectedWireId === w.id ? 'issues-panel__row--selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelectWire(w.id)}
                >
                  <span className="issues-panel__row-label">{wireTitle(diagram, w.id)}</span>
                  <span className="issues-panel__row-meta">{w.color}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="issues-panel__block">
        <h4 className="issues-panel__subtitle">Opposing flow at connections</h4>
        {opposedLinks.length === 0 ? (
          <p className="issues-panel__empty">None</p>
        ) : (
          <ul className="issues-panel__list">
            {opposedLinks.map((link) => {
              const a = wireTitle(diagram, link.wireIdA);
              const b = wireTitle(diagram, link.wireIdB);
              return (
                <li key={link.id}>
                  <button
                    type="button"
                    className={[
                      'issues-panel__row',
                      selectedLinkId === link.id ? 'issues-panel__row--selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSelectLink(link.id)}
                  >
                    <span className="issues-panel__row-label">
                      {a} ↔ {b}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

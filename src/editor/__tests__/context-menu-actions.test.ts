import { describe, expect, it } from 'vitest';
import { addCable } from '../../domain/cable-mutations';
import { createEmptyJob } from '../../domain/defaults';
import { addJunctionBox } from '../../domain/mutations';
import { addRoom } from '../../domain/room-mutations';
import { GRID_SIZE } from '../../domain/grid';
import { buildContextMenuActions } from '../context-menu-actions';
import { emptySelection, setSingleWire } from '../diagram-selection';

describe('buildContextMenuActions', () => {
  it('offers wire delete, color, and link actions', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, GRID_SIZE * 10, GRID_SIZE * 10);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-right',
      wireColors: ['black'],
    });
    const wireId = diagram.cables[0]!.wireIds[0]!;

    const actions = buildContextMenuActions({
      diagram,
      selection: setSingleWire(wireId),
      target: { kind: 'wire', wireId },
    });
    const ids = actions.map((a) => a.id);
    expect(ids).toContain('delete');
    expect(ids).toContain('wire-create-link');
    expect(ids).toContain('wire-color-white');
    expect(ids).toContain('wire-color-red');
    expect(ids).not.toContain('wire-color-black');
  });

  it('offers cable presets on free junction anchors', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, GRID_SIZE * 10, GRID_SIZE * 10);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;

    const actions = buildContextMenuActions({
      diagram,
      selection: emptySelection(),
      target: { kind: 'junctionAnchor', boxId: box.id, anchor: 'top-center' },
    });
    const ids = actions.map((a) => a.id);
    expect(ids).toEqual(['anchor-cable-bw', 'anchor-cable-bwr']);
  });

  it('offers place door for rooms', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addRoom(diagram, 200, 200);
    const room = diagram.rooms[0]!;

    const actions = buildContextMenuActions({
      diagram,
      selection: emptySelection(),
      target: { kind: 'room', roomId: room.id },
    });
    const ids = actions.map((a) => a.id);
    expect(ids).toContain('room-place-door');
    expect(ids).toContain('delete');
  });
});

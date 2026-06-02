import { describe, expect, it } from 'vitest';
import { addCable } from '../../domain/cable-mutations';
import { createEmptyJob } from '../../domain/defaults';
import { addLightBulb, addSwitch } from '../../domain/device-mutations';
import { GRID_SIZE } from '../../domain/grid';
import { addHub, addJunctionBox } from '../../domain/mutations';
import { addRoom } from '../../domain/room-mutations';
import {
  captureSelectionForDuplicate,
  DUPLICATE_OFFSET,
  duplicateClipboardOntoDiagram,
  selectionHasDuplicateableContent,
  shiftDuplicateClipboard,
} from '../duplicate-selection';
import { emptySelection, setSingleJunctionBox, setSingleLightBulb } from '../diagram-selection';

describe('selectionHasDuplicateableContent', () => {
  it('is false for wire-only selection', () => {
    const sel = emptySelection();
    sel.wires.add('w1');
    expect(selectionHasDuplicateableContent(sel)).toBe(false);
  });

  it('is true when a device is selected', () => {
    const sel = emptySelection();
    sel.lightBulbs.add('b1');
    expect(selectionHasDuplicateableContent(sel)).toBe(true);
  });
});

describe('captureSelectionForDuplicate', () => {
  it('returns null when nothing structure-related is selected', () => {
    const diagram = createEmptyJob().diagram;
    const sel = emptySelection();
    sel.wires.add('w1');
    expect(captureSelectionForDuplicate(diagram, sel)).toBeNull();
  });

  it('captures a junction box and its hubs', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 400, 400);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addHub(diagram, box.id);
    const clip = captureSelectionForDuplicate(diagram, setSingleJunctionBox(box.id));
    expect(clip).not.toBeNull();
    expect(clip!.junctionBoxes).toHaveLength(1);
    expect(clip!.hubs).toHaveLength(1);
    expect(clip!.hubs[0]!.junctionBoxId).toBe(box.id);
  });

  it('includes parent box when only a hub is selected', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, 400, 400);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addHub(diagram, box.id);
    const hub = diagram.hubs.find((h) => h.junctionBoxId === box.id)!;
    const sel = emptySelection();
    sel.hubs.add(hub.id);
    const clip = captureSelectionForDuplicate(diagram, sel)!;
    expect(clip.junctionBoxes).toHaveLength(1);
    expect(clip.hubs).toHaveLength(1);
  });
});

describe('duplicateClipboardOntoDiagram', () => {
  it('creates offset copies with new ids and selects them', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 300, 300);
    diagram = addSwitch(diagram, 600, 300, 2);
    const bulb = diagram.lightBulbs[0]!;
    const sw = diagram.switches[0]!;

    const sel = emptySelection();
    sel.lightBulbs.add(bulb.id);
    sel.switches.add(sw.id);
    const clip = captureSelectionForDuplicate(diagram, sel)!;

    const { diagram: next, selection } = duplicateClipboardOntoDiagram(
      diagram,
      clip,
      DUPLICATE_OFFSET,
      DUPLICATE_OFFSET,
    );

    expect(next.lightBulbs).toHaveLength(2);
    expect(next.switches).toHaveLength(2);
    const newBulb = next.lightBulbs.find((b) => b.id !== bulb.id)!;
    expect(newBulb.x).toBeCloseTo(bulb.x + DUPLICATE_OFFSET);
    expect(newBulb.y).toBeCloseTo(bulb.y + DUPLICATE_OFFSET);
    expect(selection.lightBulbs.has(newBulb.id)).toBe(true);
    expect(next.deviceNodes.length).toBeGreaterThan(diagram.deviceNodes.length);
  });

  it('duplicates a room with new door ids', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addRoom(diagram, 100, 100);
    const room = diagram.rooms![0]!;
    const clip = captureSelectionForDuplicate(diagram, (() => {
      const s = emptySelection();
      s.rooms.add(room.id);
      return s;
    })())!;

    const { diagram: next } = duplicateClipboardOntoDiagram(diagram, clip, DUPLICATE_OFFSET, 0);
    expect(next.rooms).toHaveLength(2);
    const copy = next.rooms!.find((r) => r.id !== room.id)!;
    expect(copy.x).toBeCloseTo(room.x + DUPLICATE_OFFSET);
    for (const door of copy.doors) {
      expect(room.doors.every((d) => d.id !== door.id)).toBe(true);
    }
  });

  it('shiftDuplicateClipboard advances stored positions for repeated paste', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 100, 100);
    const bulb = diagram.lightBulbs[0]!;
    const clip0 = captureSelectionForDuplicate(diagram, setSingleLightBulb(bulb.id))!;
    const clip1 = shiftDuplicateClipboard(clip0, DUPLICATE_OFFSET, DUPLICATE_OFFSET);
    expect(clip1.lightBulbs[0]!.x).toBeCloseTo(clip0.lightBulbs[0]!.x + DUPLICATE_OFFSET);
  });

  it('includes selected wires and their cable when duplicating a junction box', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addJunctionBox(diagram, GRID_SIZE * 15, GRID_SIZE * 15);
    const box = diagram.junctionBoxes.find((b) => b.type === 'normal')!;
    diagram = addCable(diagram, {
      junctionBoxId: box.id,
      anchor: 'middle-right',
      wireColors: ['black', 'white'],
    });
    const cable = diagram.cables[0]!;
    const wireId = cable.wireIds[0]!;

    const sel = emptySelection();
    sel.junctionBoxes.add(box.id);
    sel.wires.add(wireId);
    const clip = captureSelectionForDuplicate(diagram, sel)!;

    expect(clip.cables).toHaveLength(1);
    expect(clip.wires.length).toBeGreaterThanOrEqual(2);
    expect(clip.layoutPaths.exposedPaths[wireId]?.points?.length).toBeGreaterThan(0);

    const boxCountBefore = diagram.junctionBoxes.length;
    const cableCountBefore = diagram.cables.length;

    const { diagram: next, selection } = duplicateClipboardOntoDiagram(
      diagram,
      clip,
      DUPLICATE_OFFSET,
      DUPLICATE_OFFSET,
    );

    expect(next.junctionBoxes).toHaveLength(boxCountBefore + 1);
    expect(next.cables).toHaveLength(cableCountBefore + 1);
    expect(next.wires.length).toBeGreaterThan(diagram.wires.length);
    expect(selection.wires.size).toBeGreaterThan(0);
    expect(selection.cables.size).toBe(1);
    expect(selection.junctionBoxes.has(box.id)).toBe(false);
    expect([...selection.junctionBoxes].every((id) => id !== box.id)).toBe(true);
  });

  it('selects all duplicated device nodes and wires', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 300, 300);
    diagram = addSwitch(diagram, 600, 300, 2);
    const bulb = diagram.lightBulbs[0]!;
    const sw = diagram.switches[0]!;

    const sel = emptySelection();
    sel.lightBulbs.add(bulb.id);
    sel.switches.add(sw.id);
    const clip = captureSelectionForDuplicate(diagram, sel)!;
    const { selection } = duplicateClipboardOntoDiagram(diagram, clip, DUPLICATE_OFFSET, DUPLICATE_OFFSET);

    expect(selection.lightBulbs.size).toBe(1);
    expect(selection.switches.size).toBe(1);
    expect(selection.deviceNodes.size).toBeGreaterThan(0);
    expect(selection.lightBulbs.has(bulb.id)).toBe(false);
    expect(selection.switches.has(sw.id)).toBe(false);
  });
});

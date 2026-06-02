import { describe, expect, it } from 'vitest';
import {
  classifyMultiTouchGesture,
  clientCenter,
  clientDistance,
  MULTITOUCH_PAN_ACTIVATION_PX,
  MULTITOUCH_ZOOM_ACTIVATION_RATIO,
  pinchStartDistancePx,
  viewForMultiTouchGesture,
  viewForMultiTouchPan,
  viewForMultiTouchZoom,
  type MultiTouchSession,
} from '../viewport-multitouch-gesture';

const baseSession: MultiTouchSession = {
  mode: 'undecided',
  initialDistance: 100,
  initialScale: 1,
  initialView: { tx: 0, ty: 0, scale: 1 },
  initialCenterRoot: { x: 200, y: 200 },
  initialCenterClient: { x: 100, y: 100 },
};

describe('classifyMultiTouchGesture', () => {
  it('stays undecided until pan or zoom threshold is crossed', () => {
    expect(
      classifyMultiTouchGesture('undecided', baseSession.initialCenterClient, 100, [
        { x: 50, y: 100 },
        { x: 150, y: 100 },
      ]),
    ).toBe('undecided');
  });

  it('locks to pan when the midpoint moves enough', () => {
    const moved = [
      { x: 50 + MULTITOUCH_PAN_ACTIVATION_PX, y: 100 },
      { x: 150 + MULTITOUCH_PAN_ACTIVATION_PX, y: 100 },
    ];
    expect(classifyMultiTouchGesture('undecided', baseSession.initialCenterClient, 100, moved)).toBe('pan');
  });

  it('locks to zoom when finger separation changes enough', () => {
    const spread = [
      { x: 50, y: 100 },
      { x: 150 + 100 * MULTITOUCH_ZOOM_ACTIVATION_RATIO, y: 100 },
    ];
    expect(classifyMultiTouchGesture('undecided', baseSession.initialCenterClient, 100, spread)).toBe('zoom');
  });

  it('keeps an already locked mode', () => {
    expect(classifyMultiTouchGesture('pan', baseSession.initialCenterClient, 100, [{ x: 0, y: 0 }, { x: 200, y: 0 }])).toBe(
      'pan',
    );
  });
});

describe('viewForMultiTouchPan', () => {
  it('translates without changing scale', () => {
    const next = viewForMultiTouchPan(baseSession, { x: 220, y: 200 });
    expect(next.scale).toBe(1);
    expect(next.tx).toBe(20);
    expect(next.ty).toBe(0);
  });
});

describe('viewForMultiTouchZoom', () => {
  it('scales around the gesture center', () => {
    const clamp = (v: number) => v;
    const next = viewForMultiTouchZoom(baseSession, 200, { x: 200, y: 200 }, clamp);
    expect(next.scale).toBe(2);
    expect(next.tx).toBe(-200);
    expect(next.ty).toBe(-200);
  });
});

describe('viewForMultiTouchGesture', () => {
  it('pans while undecided even if fingers spread slightly', () => {
    const session = { ...baseSession, mode: 'undecided' as const };
    const pts = [
      { x: 40, y: 100 },
      { x: 160, y: 100 },
    ];
    const next = viewForMultiTouchGesture(session, pts, clientCenter(pts), (v) => v);
    expect(next.scale).toBe(1);
  });

  it('zooms only when mode is zoom', () => {
    const session = { ...baseSession, mode: 'zoom' as const };
    const pts = [
      { x: 0, y: 100 },
      { x: 200, y: 100 },
    ];
    const next = viewForMultiTouchGesture(session, pts, { x: 200, y: 200 }, (v) => v);
    expect(next.scale).toBe(2);
  });
});

describe('pinchStartDistancePx', () => {
  it('uses a larger threshold on touch navigation profiles', () => {
    expect(pinchStartDistancePx(false)).toBe(12);
    expect(pinchStartDistancePx(true)).toBe(28);
  });
});

describe('clientDistance', () => {
  it('measures separation between two client points', () => {
    expect(clientDistance([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
  });
});

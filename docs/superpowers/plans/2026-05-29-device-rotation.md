# Device Rotation (90°) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user rotate placed devices (light bulbs, switches, dimmer switches, outlets) in 90° increments — clockwise with `R`, counter-clockwise with `Shift+R`, plus Inspector buttons — with the whole device (body, text, terminals) rotating rigidly.

**Architecture:** Add an optional `orientation` (0/90/180/270, clockwise degrees) field to each device. Rendering wraps each shape's group in an SVG `rotate(orientation, cx, cy)` transform. The terminal-geometry function `deviceNodeWorldPoint` becomes rotation-aware so all world-space consumers (wires, conduits, hubs, hit layers) follow automatically; shape components switch to a new unrotated `deviceNodeLocalPoint` helper internally to avoid double-applying rotation.

**Tech Stack:** TypeScript, React 19, SVG, Zustand store, Vitest.

---

## Reference: commands

- Run one test file: `npx vitest run src/domain/__tests__/<file>.ts`
- Run a single test by name: `npx vitest run -t "<test name>"`
- Run all tests: `npm run test:run`
- Lint: `npm run lint`
- Typecheck/build: `npm run build`

## File Structure

- Modify `src/domain/types.ts` — add `orientation?: 0 | 90 | 180 | 270` to `LightBulb`, `Switch`, `DimmerSwitch`, `Outlet`.
- Modify `src/domain/device-node-geometry.ts` — add `deviceOrientation`, `deviceCenter`, `rotateAroundCenter`, `deviceNodeLocalPoint`; make `deviceNodeWorldPoint` rotation-aware.
- Modify `src/domain/device-mutations.ts` — add `rotateDevice`.
- Modify `src/domain/normalize-devices.ts` — normalize `orientation` on load.
- Modify `src/editor/selection-actions.ts` — add `rotateSelectedDevices`.
- Modify the four shape components in `src/canvas/` — apply rotate transform + use `deviceNodeLocalPoint`.
- Modify `src/editor/Inspector.tsx` — add rotate buttons + `onRotate` callbacks.
- Modify `src/screens/EditorScreen.tsx` — keyboard shortcut + wire Inspector `onRotate`.
- Tests: `src/domain/__tests__/device-rotation.test.ts` (new), plus additions to `src/domain/__tests__/normalize-devices.test.ts`.

---

## Task 1: Add `orientation` to device types

**Files:**
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Add the field to all four device interfaces**

In `src/domain/types.ts`, add this line to `LightBulb` (after `y: number;`), and to `Switch`, `DimmerSwitch`, and `Outlet` (after their `height: number;` line):

```ts
  /** Clockwise rotation in degrees. One of 0 | 90 | 180 | 270. Defaults to 0 when absent. */
  orientation?: 0 | 90 | 180 | 270;
```

For `LightBulb` (which has no width/height) place it right after `y: number;`:

```ts
export interface LightBulb {
  id: string;
  label: string;
  /** Top-left of bounding square in world space. */
  x: number;
  y: number;
  /** Clockwise rotation in degrees. One of 0 | 90 | 180 | 270. Defaults to 0 when absent. */
  orientation?: 0 | 90 | 180 | 270;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run build`
Expected: PASS (no type errors; the field is optional and additive).

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts
git commit -m "feat: add optional orientation field to devices"
```

---

## Task 2: Rotation-aware terminal geometry

This is the core change. We add helpers and make `deviceNodeWorldPoint` return the rotated world position, while exposing the unrotated point via `deviceNodeLocalPoint` for shape rendering.

**Files:**
- Modify: `src/domain/device-node-geometry.ts`
- Test: `src/domain/__tests__/device-rotation.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/domain/__tests__/device-rotation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../defaults';
import { addSwitch } from '../device-mutations';
import { deviceNodeWorldPoint } from '../device-node-geometry';
import type { DeviceNode } from '../types';

function switchNode(diagram: ReturnType<typeof createEmptyJob>['diagram'], slot: number): DeviceNode {
  return diagram.deviceNodes.find((n) => n.deviceKind === 'switch' && n.slot === slot)!;
}

describe('rotation-aware terminal geometry', () => {
  it('leaves terminals in place at orientation 0', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 300, 300, 2);
    const sw = diagram.switches[0]!;
    const left = deviceNodeWorldPoint(diagram, switchNode(diagram, 0))!;
    const right = deviceNodeWorldPoint(diagram, switchNode(diagram, 1))!;
    const cy = sw.y + sw.height / 2;
    expect(left).toEqual({ x: sw.x, y: cy });
    expect(right).toEqual({ x: sw.x + sw.width, y: cy });
  });

  it('rotates the left terminal to the top after one clockwise quarter turn', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 300, 300, 2);
    const sw = { ...diagram.switches[0]!, orientation: 90 as const };
    diagram = { ...diagram, switches: [sw] };
    const cx = sw.x + sw.width / 2;
    const cy = sw.y + sw.height / 2;
    // unrotated left terminal is (sw.x, cy); rotating CW 90 about center maps it to top-center.
    const left = deviceNodeWorldPoint(diagram, switchNode(diagram, 0))!;
    expect(left.x).toBeCloseTo(cx);
    expect(left.y).toBeCloseTo(sw.y);
  });

  it('rotates the left terminal to the bottom after a 270° turn', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 300, 300, 2);
    const sw = { ...diagram.switches[0]!, orientation: 270 as const };
    diagram = { ...diagram, switches: [sw] };
    const cx = sw.x + sw.width / 2;
    // unrotated left terminal (sw.x, cy) rotates CW 270 about center to bottom-center.
    const left = deviceNodeWorldPoint(diagram, switchNode(diagram, 0))!;
    expect(left.x).toBeCloseTo(cx);
    expect(left.y).toBeCloseTo(sw.y + sw.height);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/__tests__/device-rotation.test.ts`
Expected: FAIL — the orientation-90 case fails because `deviceNodeWorldPoint` ignores orientation.

- [ ] **Step 3: Add helpers and make `deviceNodeWorldPoint` rotation-aware**

In `src/domain/device-node-geometry.ts`, add these helpers near the top (after the `*ById` lookups and `lightBulbCenter`):

```ts
/** Clockwise rotation for a device, defaulting to 0. */
export function deviceOrientation(device: { orientation?: number } | null | undefined): number {
  const raw = device?.orientation ?? 0;
  const norm = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
  return norm;
}

/** Center of a device in world space, used as the rotation pivot. */
export function deviceCenter(diagram: Diagram, node: DeviceNode): { x: number; y: number } | null {
  if (node.deviceKind === 'lightBulb') {
    const bulb = lightBulbById(diagram, node.deviceId);
    return bulb ? lightBulbCenter(bulb) : null;
  }
  const sw = switchById(diagram, node.deviceId);
  if (sw) return { x: sw.x + sw.width / 2, y: sw.y + sw.height / 2 };
  const dim = dimmerById(diagram, node.deviceId);
  if (dim) return { x: dim.x + dim.width / 2, y: dim.y + dim.height / 2 };
  const outlet = outletById(diagram, node.deviceId);
  if (outlet) return { x: outlet.x + outlet.width / 2, y: outlet.y + outlet.height / 2 };
  return null;
}

/** Rotate a point clockwise by `deg` (only 0/90/180/270 expected) around `center`. */
export function rotateAroundCenter(
  pt: { x: number; y: number },
  center: { x: number; y: number },
  deg: number,
): { x: number; y: number } {
  if (deg === 0) return pt;
  const dx = pt.x - center.x;
  const dy = pt.y - center.y;
  // Clockwise rotation in SVG's y-down coordinate system.
  switch (((deg % 360) + 360) % 360) {
    case 90:
      return { x: center.x - dy, y: center.y + dx };
    case 180:
      return { x: center.x - dx, y: center.y - dy };
    case 270:
      return { x: center.x + dy, y: center.y - dx };
    default:
      return pt;
  }
}

/** Orientation-aware lookup of the device this node belongs to. */
function deviceForNode(diagram: Diagram, node: DeviceNode): { orientation?: number } | null {
  if (node.deviceKind === 'lightBulb') return lightBulbById(diagram, node.deviceId) ?? null;
  if (node.deviceKind === 'switch') return switchById(diagram, node.deviceId) ?? null;
  if (node.deviceKind === 'dimmerSwitch') return dimmerById(diagram, node.deviceId) ?? null;
  if (node.deviceKind === 'outlet') return outletById(diagram, node.deviceId) ?? null;
  return null;
}
```

Then rename the existing `deviceNodeWorldPoint` body to a new exported function `deviceNodeLocalPoint` (its logic is unchanged — it still returns the unrotated point), and add a new `deviceNodeWorldPoint` that rotates it:

```ts
/** World position for a device terminal IGNORING rotation (used by shape rendering inside a rotated group). */
export function deviceNodeLocalPoint(diagram: Diagram, node: DeviceNode): { x: number; y: number } | null {
  // ... existing body of the old deviceNodeWorldPoint, unchanged ...
}

/** World position for a device terminal accounting for the device's orientation. */
export function deviceNodeWorldPoint(diagram: Diagram, node: DeviceNode): { x: number; y: number } | null {
  const local = deviceNodeLocalPoint(diagram, node);
  if (!local) return null;
  const orientation = deviceOrientation(deviceForNode(diagram, node));
  if (orientation === 0) return local;
  const center = deviceCenter(diagram, node);
  if (!center) return local;
  return rotateAroundCenter(local, center, orientation);
}
```

Note: `deviceNodeOutwardNormal` already calls `deviceNodeWorldPoint` internally, so it becomes rotation-correct with no further edits.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/__tests__/device-rotation.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite to check for regressions**

Run: `npm run test:run`
Expected: PASS (existing tests use orientation 0 so geometry is unchanged for them).

- [ ] **Step 6: Commit**

```bash
git add src/domain/device-node-geometry.ts src/domain/__tests__/device-rotation.test.ts
git commit -m "feat: make device terminal geometry rotation-aware"
```

---

## Task 3: `rotateDevice` mutation

**Files:**
- Modify: `src/domain/device-mutations.ts`
- Test: `src/domain/__tests__/device-rotation.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/domain/__tests__/device-rotation.test.ts`:

```ts
import { addLightBulb, addOutlet, addDimmerSwitch, rotateDevice } from '../device-mutations';

describe('rotateDevice', () => {
  it('cycles a switch clockwise through 90/180/270/0', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 300, 300, 2);
    const id = diagram.switches[0]!.id;
    diagram = rotateDevice(diagram, 'switch', id, 'cw');
    expect(diagram.switches[0]!.orientation).toBe(90);
    diagram = rotateDevice(diagram, 'switch', id, 'cw');
    expect(diagram.switches[0]!.orientation).toBe(180);
    diagram = rotateDevice(diagram, 'switch', id, 'cw');
    expect(diagram.switches[0]!.orientation).toBe(270);
    diagram = rotateDevice(diagram, 'switch', id, 'cw');
    expect(diagram.switches[0]!.orientation).toBe(0);
  });

  it('rotates counter-clockwise', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addOutlet(diagram, 300, 300, false);
    const id = diagram.outlets[0]!.id;
    diagram = rotateDevice(diagram, 'outlet', id, 'ccw');
    expect(diagram.outlets[0]!.orientation).toBe(270);
  });

  it('rotates a light bulb and a dimmer', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addLightBulb(diagram, 200, 200);
    diagram = addDimmerSwitch(diagram, 400, 400);
    const bulbId = diagram.lightBulbs[0]!.id;
    const dimId = diagram.dimmerSwitches[0]!.id;
    diagram = rotateDevice(diagram, 'lightBulb', bulbId, 'cw');
    diagram = rotateDevice(diagram, 'dimmerSwitch', dimId, 'cw');
    expect(diagram.lightBulbs[0]!.orientation).toBe(90);
    expect(diagram.dimmerSwitches[0]!.orientation).toBe(90);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/domain/__tests__/device-rotation.test.ts -t "rotateDevice"`
Expected: FAIL — `rotateDevice` not exported.

- [ ] **Step 3: Implement `rotateDevice`**

In `src/domain/device-mutations.ts`, add a type and function. Add near the other exports:

```ts
export type DeviceRotationKind = 'lightBulb' | 'switch' | 'dimmerSwitch' | 'outlet';
export type RotationDirection = 'cw' | 'ccw';

function nextOrientation(current: number | undefined, direction: RotationDirection): 0 | 90 | 180 | 270 {
  const base = ((Math.round((current ?? 0) / 90) * 90) % 360 + 360) % 360;
  const delta = direction === 'cw' ? 90 : -90;
  const next = ((base + delta) % 360 + 360) % 360;
  return next as 0 | 90 | 180 | 270;
}

/** Rotates a single device 90° around its own center and refreshes attached paths. */
export function rotateDevice(
  diagram: Diagram,
  kind: DeviceRotationKind,
  id: string,
  direction: RotationDirection,
): Diagram {
  if (kind === 'lightBulb') {
    const bulb = diagram.lightBulbs.find((b) => b.id === id);
    if (!bulb) return diagram;
    const orientation = nextOrientation(bulb.orientation, direction);
    return refreshHubWirePaths(
      rebuildDeviceConduitPathsForDevice(
        {
          ...diagram,
          lightBulbs: diagram.lightBulbs.map((b) => (b.id === id ? { ...b, orientation } : b)),
        },
        'lightBulb',
        id,
      ),
    );
  }
  if (kind === 'switch') {
    const sw = diagram.switches.find((s) => s.id === id);
    if (!sw) return diagram;
    const orientation = nextOrientation(sw.orientation, direction);
    return refreshHubWirePaths(
      rebuildDeviceConduitPathsForDevice(
        {
          ...diagram,
          switches: diagram.switches.map((s) => (s.id === id ? { ...s, orientation } : s)),
        },
        'switch',
        id,
      ),
    );
  }
  if (kind === 'dimmerSwitch') {
    const dim = (diagram.dimmerSwitches ?? []).find((d) => d.id === id);
    if (!dim) return diagram;
    const orientation = nextOrientation(dim.orientation, direction);
    return refreshHubWirePaths(
      rebuildDeviceConduitPathsForDevice(
        {
          ...diagram,
          dimmerSwitches: (diagram.dimmerSwitches ?? []).map((d) =>
            d.id === id ? { ...d, orientation } : d,
          ),
        },
        'dimmerSwitch',
        id,
      ),
    );
  }
  const outlet = (diagram.outlets ?? []).find((o) => o.id === id);
  if (!outlet) return diagram;
  const orientation = nextOrientation(outlet.orientation, direction);
  return refreshHubWirePaths(
    rebuildDeviceConduitPathsForDevice(
      {
        ...diagram,
        outlets: (diagram.outlets ?? []).map((o) => (o.id === id ? { ...o, orientation } : o)),
      },
      'outlet',
      id,
    ),
  );
}
```

(The imports `refreshHubWirePaths`, `rebuildDeviceConduitPathsForDevice` are already present at the top of this file.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/domain/__tests__/device-rotation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/device-mutations.ts src/domain/__tests__/device-rotation.test.ts
git commit -m "feat: add rotateDevice mutation"
```

---

## Task 4: Normalize orientation on load

**Files:**
- Modify: `src/domain/normalize-devices.ts`
- Test: `src/domain/__tests__/normalize-devices.test.ts`

- [ ] **Step 1: Add a failing test**

Add to `src/domain/__tests__/normalize-devices.test.ts` (inside the existing top-level `describe`, or a new one — match the file's existing style):

```ts
it('normalizes device orientation to a quarter turn, defaulting to 0', () => {
  let diagram = createEmptyJob().diagram;
  diagram = addSwitch(diagram, 300, 300, 2);
  const id = diagram.switches[0]!.id;
  // Invalid / missing orientation values get snapped.
  const dirty = {
    ...diagram,
    switches: diagram.switches.map((s) => ({ ...s, orientation: 95 as unknown as 0 })),
  };
  const cleaned = normalizeDeviceNodes(dirty);
  expect(cleaned.switches.find((s) => s.id === id)!.orientation).toBe(90);

  const missing = {
    ...diagram,
    switches: diagram.switches.map((s) => {
      const { orientation: _drop, ...rest } = s as typeof s & { orientation?: number };
      return rest;
    }),
  };
  const cleaned2 = normalizeDeviceNodes(missing);
  expect(cleaned2.switches.find((s) => s.id === id)!.orientation).toBe(0);
});
```

Ensure the file imports `createEmptyJob`, `addSwitch`, and `normalizeDeviceNodes`. If they're not already imported, add:

```ts
import { createEmptyJob } from '../defaults';
import { addSwitch } from '../device-mutations';
import { normalizeDeviceNodes } from '../normalize-devices';
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/domain/__tests__/normalize-devices.test.ts -t "orientation"`
Expected: FAIL — orientation is not normalized (95 is preserved).

- [ ] **Step 3: Implement normalization**

In `src/domain/normalize-devices.ts`, add a helper near the top (after imports):

```ts
function normalizeOrientation(value: unknown): 0 | 90 | 180 | 270 {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const norm = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
  return norm as 0 | 90 | 180 | 270;
}
```

Then in the returned object of `normalizeDeviceNodes`, add `orientation` to each device map. Update the four device arrays:

```ts
    lightBulbs: bulbs.map((b) => ({ ...b, orientation: normalizeOrientation(b.orientation) })),
    switches: switches.map((s) => {
      const terminalCount = switchTerminalCount(s);
      return {
        ...s,
        terminalCount,
        position: normalizeSwitchPosition({ ...s, terminalCount }),
        orientation: normalizeOrientation(s.orientation),
      };
    }),
    dimmerSwitches: dimmerSwitches.map((d) => ({
      ...d,
      level: normalizeDimmerLevel(d),
      position: normalizeDimmerPosition(d),
      orientation: normalizeOrientation(d.orientation),
    })),
    outlets: outlets.map((o) => ({
      ...o,
      passthrough: Boolean(o.passthrough),
      orientation: normalizeOrientation(o.orientation),
    })),
```

Note the existing code currently returns `lightBulbs: bulbs,` — replace that line with the `.map(...)` version above.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/domain/__tests__/normalize-devices.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/normalize-devices.ts src/domain/__tests__/normalize-devices.test.ts
git commit -m "feat: normalize device orientation on load"
```

---

## Task 5: `rotateSelectedDevices` (multi-select, each in place)

**Files:**
- Modify: `src/editor/selection-actions.ts`
- Test: `src/domain/__tests__/device-rotation.test.ts`

- [ ] **Step 1: Add a failing test**

Append to `src/domain/__tests__/device-rotation.test.ts`:

```ts
import { emptySelection } from '../../editor/diagram-selection';
import { rotateSelectedDevices } from '../../editor/selection-actions';

describe('rotateSelectedDevices', () => {
  it('rotates every selected device around its own center', () => {
    let diagram = createEmptyJob().diagram;
    diagram = addSwitch(diagram, 300, 300, 2);
    diagram = addOutlet(diagram, 600, 600, false);
    const swId = diagram.switches[0]!.id;
    const outletId = diagram.outlets[0]!.id;
    const swX = diagram.switches[0]!.x;
    const outletX = diagram.outlets[0]!.x;

    const selection = emptySelection();
    selection.switches.add(swId);
    selection.outlets.add(outletId);

    diagram = rotateSelectedDevices(diagram, selection, 'cw');
    expect(diagram.switches[0]!.orientation).toBe(90);
    expect(diagram.outlets[0]!.orientation).toBe(90);
    // Positions (top-left) are unchanged — each rotates about its own center.
    expect(diagram.switches[0]!.x).toBe(swX);
    expect(diagram.outlets[0]!.x).toBe(outletX);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/domain/__tests__/device-rotation.test.ts -t "rotateSelectedDevices"`
Expected: FAIL — `rotateSelectedDevices` not exported.

- [ ] **Step 3: Implement it**

In `src/editor/selection-actions.ts`, add the import and function. Add to the existing import from device-mutations:

```ts
import {
  deleteLightBulb,
  deleteSwitch,
  deleteDimmerSwitch,
  deleteOutlet,
  rotateDevice,
  type RotationDirection,
} from '../domain/device-mutations';
```

Then add:

```ts
/** Rotates every selected device 90° around its own center. */
export function rotateSelectedDevices(
  diagram: Diagram,
  selection: DiagramSelection,
  direction: RotationDirection,
): Diagram {
  let next = diagram;
  for (const id of selection.lightBulbs) next = rotateDevice(next, 'lightBulb', id, direction);
  for (const id of selection.switches) next = rotateDevice(next, 'switch', id, direction);
  for (const id of selection.dimmerSwitches) next = rotateDevice(next, 'dimmerSwitch', id, direction);
  for (const id of selection.outlets) next = rotateDevice(next, 'outlet', id, direction);
  return next;
}

/** True when the selection contains at least one rotatable device. */
export function selectionHasRotatableDevice(selection: DiagramSelection): boolean {
  return (
    selection.lightBulbs.size > 0 ||
    selection.switches.size > 0 ||
    selection.dimmerSwitches.size > 0 ||
    selection.outlets.size > 0
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/domain/__tests__/device-rotation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/editor/selection-actions.ts src/domain/__tests__/device-rotation.test.ts
git commit -m "feat: rotate all selected devices each around its own center"
```

---

## Task 6: Apply rotate transform in shape rendering

Each shape currently computes terminal local coords via `deviceNodeWorldPoint(...) - device.{x,y}`. Switch those to `deviceNodeLocalPoint` and add a `rotate(...)` to the group transform so body + text + terminals rotate together.

**Files:**
- Modify: `src/canvas/SwitchShape.tsx`
- Modify: `src/canvas/OutletShape.tsx`
- Modify: `src/canvas/DimmerSwitchShape.tsx`
- Modify: `src/canvas/LightBulbShape.tsx`

- [ ] **Step 1: SwitchShape**

In `src/canvas/SwitchShape.tsx`:

Change the import line `deviceNodeWorldPoint,` to `deviceNodeLocalPoint, deviceOrientation,` (keep the other names in that import block).

In the `nodeLayout` map, replace `const world = deviceNodeWorldPoint(diagram, node);` with `const world = deviceNodeLocalPoint(diagram, node);`.

Add an orientation constant just before the `return (`:

```ts
  const orientation = deviceOrientation(sw);
```

Change the group transform from:

```tsx
      transform={`translate(${sw.x}, ${sw.y})`}
```

to:

```tsx
      transform={`translate(${sw.x}, ${sw.y}) rotate(${orientation}, ${cx}, ${cy})`}
```

(`cx`/`cy` are already defined as `sw.width / 2` and `sw.height / 2`.)

- [ ] **Step 2: OutletShape**

In `src/canvas/OutletShape.tsx`: change import `deviceNodeWorldPoint,` → `deviceNodeLocalPoint, deviceOrientation,`. In `nodeLayout`, replace `deviceNodeWorldPoint` with `deviceNodeLocalPoint`. Add `const orientation = deviceOrientation(outlet);` before the `return (`. Change `transform={\`translate(${outlet.x}, ${outlet.y})\`}` to `transform={\`translate(${outlet.x}, ${outlet.y}) rotate(${orientation}, ${cx}, ${cy})\`}` (`cx`/`cy` already defined).

- [ ] **Step 3: DimmerSwitchShape**

In `src/canvas/DimmerSwitchShape.tsx`: change import `deviceNodeWorldPoint,` → `deviceNodeLocalPoint, deviceOrientation,`. In `nodeLayout`, replace `deviceNodeWorldPoint` with `deviceNodeLocalPoint`. Add `const orientation = deviceOrientation(dim);` before the `return (`. Change `transform={\`translate(${dim.x}, ${dim.y})\`}` to `transform={\`translate(${dim.x}, ${dim.y}) rotate(${orientation}, ${cx}, ${cy})\`}` (`cx`/`cy` already defined).

- [ ] **Step 4: LightBulbShape**

In `src/canvas/LightBulbShape.tsx`: change import `deviceNodeWorldPoint,` → `deviceNodeLocalPoint, deviceOrientation,`. The bulb has no `cx/cy` vars; its local center is `(r, r)`. Inside the `nodes.map`, replace `const world = deviceNodeWorldPoint(diagram, node);` with `const world = deviceNodeLocalPoint(diagram, node);`. Add `const orientation = deviceOrientation(bulb);` before the `return (`. Change `transform={\`translate(${bulb.x}, ${bulb.y})\`}` to `transform={\`translate(${bulb.x}, ${bulb.y}) rotate(${orientation}, ${r}, ${r})\`}`.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run build && npm run lint`
Expected: PASS. (If lint flags an unused `deviceNodeWorldPoint` import anywhere, it was fully replaced — make sure each changed file no longer imports `deviceNodeWorldPoint`.)

- [ ] **Step 6: Commit**

```bash
git add src/canvas/SwitchShape.tsx src/canvas/OutletShape.tsx src/canvas/DimmerSwitchShape.tsx src/canvas/LightBulbShape.tsx
git commit -m "feat: render devices with rotation transform"
```

---

## Task 7: Keyboard shortcut (R / Shift+R)

**Files:**
- Modify: `src/screens/EditorScreen.tsx`

- [ ] **Step 1: Add imports**

In `src/screens/EditorScreen.tsx`, update the import from `selection-actions` to include the new helpers:

```ts
import { deleteAllSelected, rotateSelectedDevices, selectionHasRotatableDevice } from '../editor/selection-actions';
```

- [ ] **Step 2: Handle the key in the keydown effect**

In the second `onKeyDown` (the one starting around line 324 that handles Escape/undo/tool shortcuts/Delete), add a rotation branch. Place it AFTER the tool-shortcut block (after the `const nextTool = toolForShortcutKey(e.key);` block closes) and BEFORE the dimmer ArrowUp/Down block:

```ts
      if (!mod && e.key.toLowerCase() === 'r' && tool === 'select' && selectionHasRotatableDevice(selection)) {
        e.preventDefault();
        const direction = e.shiftKey ? 'ccw' : 'cw';
        updateDiagram((d) => rotateSelectedDevices(d, selection, direction));
        return;
      }
```

Note: the tool-shortcut block is guarded by `if (!mod && !e.altKey && e.key.length === 1)` and only matches keys registered in `TOOL_SHORTCUTS`. `r` is not registered, so it falls through to this new branch. Because `Shift+R` produces `e.key === 'R'`, using `e.key.toLowerCase() === 'r'` covers both. The handler already early-returns when focus is in an INPUT/TEXTAREA/SELECT.

- [ ] **Step 3: Ensure the effect dependency array includes what it uses**

The effect already depends on `tool`, `selection`, and `updateDiagram` (verify in the dependency array at the bottom of that `useEffect`; `selection` and `updateDiagram` are referenced elsewhere in the same effect). If `updateDiagram` or `selection` is missing from the deps array, add it.

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`, place a switch, select it, press `R` — it rotates 90° clockwise; `Shift+R` rotates counter-clockwise; attached wires follow the terminals. Then commit.

- [ ] **Step 6: Commit**

```bash
git add src/screens/EditorScreen.tsx
git commit -m "feat: rotate selected devices with R / Shift+R"
```

---

## Task 8: Inspector rotate buttons

**Files:**
- Modify: `src/editor/Inspector.tsx`
- Modify: `src/screens/EditorScreen.tsx`

- [ ] **Step 1: Add the callback prop to Inspector**

In `src/editor/Inspector.tsx`, add to `InspectorProps`:

```ts
  onRotateDevice?: (direction: 'cw' | 'ccw') => void;
```

Add `onRotateDevice` to the destructured props in the `Inspector` function signature.

- [ ] **Step 2: Add a reusable rotate control and render it in the four device panels**

Near the top of `Inspector.tsx` (after imports, before `InspectorProps`), add a small helper component:

```tsx
function RotateControl({ onRotate }: { onRotate?: (direction: 'cw' | 'ccw') => void }): JSX.Element | null {
  if (!onRotate) return null;
  return (
    <div className="inspector__field">
      <span className="inspector__label">Rotation</span>
      <div className="inspector__rotate-buttons">
        <button type="button" className="btn" onClick={() => onRotate('ccw')} title="Rotate 90° counter-clockwise (Shift+R)">
          ⟲ 90°
        </button>
        <button type="button" className="btn" onClick={() => onRotate('cw')} title="Rotate 90° clockwise (R)">
          ⟳ 90°
        </button>
      </div>
    </div>
  );
}
```

Then in each of the `selection.kind === 'lightBulb'`, `'switch'`, `'dimmerSwitch'`, and `'outlet'` branches, render `<RotateControl onRotate={onRotateDevice} />` immediately after the Label `<label>` field (and, for the switch, it can go after the Simulation field — pick a consistent spot; placing it right after the Label field is simplest and consistent across all four).

- [ ] **Step 3: Wire the callback from EditorScreen**

In `src/screens/EditorScreen.tsx`, add the `rotateDevice` import:

```ts
import {
  // ...existing device-mutations imports...
  rotateDevice,
} from '../domain/device-mutations';
```

(Confirm `rotateDevice` is added to the existing import block from `../domain/device-mutations`.)

Then pass `onRotateDevice` to the `<Inspector ... />` element (near the other `onUpdate*` props):

```tsx
              onRotateDevice={(direction) => {
                const kind = selectedLightBulbId
                  ? 'lightBulb'
                  : selectedSwitchId
                    ? 'switch'
                    : selectedDimmerId
                      ? 'dimmerSwitch'
                      : selectedOutletId
                        ? 'outlet'
                        : null;
                const id =
                  selectedLightBulbId ?? selectedSwitchId ?? selectedDimmerId ?? selectedOutletId;
                if (!kind || !id) return;
                updateDiagram((d) => rotateDevice(d, kind, id, direction));
              }}
```

- [ ] **Step 4: Add styling for the button row**

In `src/styles/app.css`, add:

```css
.inspector__rotate-buttons {
  display: flex;
  gap: 8px;
}
.inspector__rotate-buttons .btn {
  flex: 1;
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run build && npm run lint`
Expected: PASS.

- [ ] **Step 6: Manual smoke test + commit**

Select a switch, click `⟳ 90°` and `⟲ 90°` in the Inspector — it rotates. Then:

```bash
git add src/editor/Inspector.tsx src/screens/EditorScreen.tsx src/styles/app.css
git commit -m "feat: add Inspector rotate buttons for devices"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm run test:run`
Expected: PASS.

- [ ] **Step 2: Lint + typecheck/build**

Run: `npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 3: Manual regression pass**

Run `npm run dev` and verify:
- Place a switch with a wire/conduit on a terminal; rotate with `R` — the wire follows the terminal to its new side.
- Rotate a light bulb — its two terminals move from left/right to top/bottom.
- Multi-select a switch and an outlet, press `R` — both rotate in place, neither moves.
- Undo (`⌘Z`) reverts a rotation.
- Save and reload the job — orientation persists.

---

## Self-Review notes

- **Spec coverage:** data model (Task 1), rotation-aware geometry (Task 2), `rotateDevice` (Task 3), normalization/persistence (Task 4), multi-select each-in-place (Task 5), full rigid render incl. text (Task 6), keyboard CW/CCW (Task 7), Inspector buttons (Task 8). Junction boxes/rooms remain out of scope.
- **Type consistency:** `rotateDevice(diagram, kind, id, direction)`, `RotationDirection = 'cw' | 'ccw'`, `DeviceRotationKind`, `deviceOrientation`, `deviceCenter`, `rotateAroundCenter`, `deviceNodeLocalPoint`, `rotateSelectedDevices`, `selectionHasRotatableDevice`, and `onRotateDevice` are used consistently across tasks.

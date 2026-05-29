# Breaker Cables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `BreakerConduit` with **breaker-type cables** (`role: 'breaker'`) that show a panel-side toggle instead of exposed wires, while keeping normal conduit stub/run behavior on the field side.

**Architecture:** Extend `Cable` with `role` and `closed`; remove `ConduitRun.breakerId` and terminate all runs as cable↔cable. Gate continuity and direction on `closed`. Migrate legacy breaker conduits and `breakers[]` on normalize. Remove the K toolbar tool; C on panel and E auto-create produce breaker cables.

**Tech Stack:** Vite, React 19, TypeScript, Vitest, SVG canvas (`src/canvas/*`), domain modules (`src/domain/*`).

**Spec:** `docs/superpowers/specs/2026-05-18-breaker-cables-design.md`

---

## File structure

```text
src/domain/
├── types.ts                         # Cable.role, Cable.closed; drop BreakerConduit, ConduitRun.breakerId
├── breaker-cable.ts                 # NEW: isBreakerCable, directionForBreakerWire, toggle helpers
├── cable-mutations.ts               # addCable on panel → breaker; toggleBreakerCable
├── cable-geometry.ts                # skip exposedPaths for breaker cables
├── conduit-run-mutations.ts         # cable-only runs; connectConduitRunToBreakerAnchor → breaker cable
├── migrate-breakers.ts              # target breaker Cable not BreakerConduit
├── cable-migration.ts               # migrate BreakerConduit → breaker Cable
├── continuity.ts                    # gate run pairing on cable.closed
├── direction.ts                     # gate seeds on cable.closed
├── normalize.ts                     # call breaker migration
├── wire-routing.ts                  # connectableWireEndpoints: breaker wires not linkable
├── mutations.ts                     # remove addBreakerConduit/addBreaker; update delete guards
└── __tests__/
    ├── breaker-cable.test.ts        # NEW
    ├── cable-mutations.test.ts      # breaker placement + toggle
    ├── conduit-run-mutations.test.ts
    ├── continuity.test.ts
    ├── direction.test.ts
    └── normalize.test.ts

src/canvas/
├── BreakerToggle.tsx                # NEW: panel-side toggle glyph
├── CableLayer.tsx                   # render toggle for breaker cables; hide exposed wires
└── DiagramSvg.tsx                   # pass toggle handler

src/editor/
├── ConduitDialog.tsx                # panel cable placement (reuse breaker preset UI under cable flow)
├── Inspector.tsx                    # breaker cable On/Off + label
├── Toolbar.tsx                      # remove K button
├── editor-tools.ts                  # remove conduit-breaker
└── editor-shortcuts.ts              # remove K shortcut

src/screens/EditorScreen.tsx         # C on panel; remove K handlers; toggle via select double-click
src/styles/app.css                   # .breaker-toggle styles
```

---

## Phase 1 — Types & helpers

### Task 1: Extend Cable type; simplify ConduitRun

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/defaults.ts`
- Modify: `src/domain/index.ts` (exports)
- Test: `src/domain/__tests__/defaults.test.ts`

- [ ] **Step 1: Update `Cable` and `ConduitRun` in `types.ts`**

```ts
export interface Cable {
  id: string;
  junctionBoxId: string;
  anchor: AnchorPosition;
  wireIds: string[];
  label?: string;
  role?: 'junction' | 'breaker';
  closed?: boolean;
}

export interface ConduitRun {
  id: string;
  cableIdA: string;
  cableIdB: string | null;
  wireIds: string[];
}
```

Remove `BreakerConduit`, `BreakerCircuitPreset` (keep preset type only if dialog still uses it — can live in `breaker-cable.ts`), and remove `breakerId` from `ConduitRun`.

- [ ] **Step 2: Ensure defaults compile**

`defaults.ts`: no breaker conduits; `cables: []`, `conduitRuns: []` unchanged.

- [ ] **Step 3: Run build**

Run: `npm run build`  
Expected: Type errors listing all `breakerId` / `BreakerConduit` references (baseline for next tasks).

---

### Task 2: Breaker cable helpers

**Files:**
- Create: `src/domain/breaker-cable.ts`
- Create: `src/domain/__tests__/breaker-cable.test.ts`
- Modify: `src/domain/index.ts`
- Delete (later task): `src/domain/breaker-conduit.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  isBreakerCable,
  breakerCableClosed,
  directionForBreakerWire,
  toggleBreakerCableClosed,
} from '../breaker-cable';
import type { Cable } from '../types';

describe('isBreakerCable', () => {
  it('returns true when role is breaker', () => {
    const c: Cable = { id: '1', junctionBoxId: 'b', anchor: 'center', wireIds: [], role: 'breaker' };
    expect(isBreakerCable(c)).toBe(true);
  });
  it('returns false for junction cables', () => {
    const c: Cable = { id: '1', junctionBoxId: 'b', anchor: 'center', wireIds: [] };
    expect(isBreakerCable(c)).toBe(false);
  });
});

describe('breakerCableClosed', () => {
  it('defaults to true when closed omitted', () => {
    expect(breakerCableClosed({ id: '1', junctionBoxId: 'b', anchor: 'center', wireIds: [], role: 'breaker' })).toBe(true);
  });
});

describe('toggleBreakerCableClosed', () => {
  it('flips closed state', () => {
    const c: Cable = { id: '1', junctionBoxId: 'b', anchor: 'center', wireIds: [], role: 'breaker', closed: true };
    expect(toggleBreakerCableClosed(c).closed).toBe(false);
  });
});

describe('directionForBreakerWire', () => {
  it('maps black/red away and white toward', () => {
    expect(directionForBreakerWire('black')).toBe('away');
    expect(directionForBreakerWire('red')).toBe('away');
    expect(directionForBreakerWire('white')).toBe('toward');
  });
});
```

- [ ] **Step 2: Run test**

Run: `npm test -- src/domain/__tests__/breaker-cable.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `breaker-cable.ts`**

```ts
import type { Cable, WireColor, WireDirection } from './types';

export type BreakerCircuitPreset = 'twoWire' | 'threeWire';

export const BREAKER_PRESET_WIRE_COLORS: Record<BreakerCircuitPreset, readonly WireColor[]> = {
  twoWire: ['black', 'white'],
  threeWire: ['white', 'black', 'red'],
};

export function isBreakerCable(cable: Cable): boolean {
  return cable.role === 'breaker';
}

export function breakerCableClosed(cable: Cable): boolean {
  return cable.closed !== false;
}

export function toggleBreakerCableClosed(cable: Cable): Cable {
  return { ...cable, closed: !breakerCableClosed(cable) };
}

export function directionForBreakerWire(color: WireColor): WireDirection | null {
  if (color === 'black' || color === 'red') return 'away';
  if (color === 'white') return 'toward';
  return null;
}

export function breakerPresetWireColors(preset: BreakerCircuitPreset): WireColor[] {
  return [...BREAKER_PRESET_WIRE_COLORS[preset]];
}
```

- [ ] **Step 4: Run test — PASS**

- [ ] **Step 5: Export from `index.ts`**

---

## Phase 2 — Mutations & geometry

### Task 3: addCable creates breaker cable on panel

**Files:**
- Modify: `src/domain/cable-mutations.ts`
- Modify: `src/domain/__tests__/cable-mutations.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it('addCable on breaker panel creates role breaker with closed true and no exposed paths', () => {
  let diagram = createTestDiagramWithBreakerPanel();
  diagram = addCable(diagram, {
    junctionBoxId: panelId,
    anchor: 'middle-left',
    wireColors: ['black', 'white'],
  });
  const cable = diagram.cables.find((c) => c.junctionBoxId === panelId)!;
  expect(cable.role).toBe('breaker');
  expect(cable.closed).toBe(true);
  for (const wid of cable.wireIds) {
    expect(diagram.layout.exposedPaths?.[wid]).toBeUndefined();
  }
});
```

- [ ] **Step 2: Implement in `addCable`**

When `box.type === 'breaker'`:
- Set `role: 'breaker'`, `closed: true`
- Do **not** populate `exposedPaths` for new wires
- Still populate `conduitStubPaths` for outward stub

When `box.type === 'normal'`:
- Set `role: 'junction'` (or omit)
- Keep existing exposed path behavior

Remove the throw that says "Use breaker circuits (K)".

- [ ] **Step 3: Add `toggleBreakerCable(diagram, cableId)` mutation**

```ts
export function toggleBreakerCable(diagram: Diagram, cableId: string): Diagram {
  const cable = diagram.cables.find((c) => c.id === cableId);
  if (!cable || !isBreakerCable(cable)) {
    throw new Error('Not a breaker cable');
  }
  return {
    ...diagram,
    cables: diagram.cables.map((c) => (c.id === cableId ? toggleBreakerCableClosed(c) : c)),
  };
}
```

- [ ] **Step 4: Run cable-mutations tests — PASS**

---

### Task 4: Skip exposed geometry for breaker cables

**Files:**
- Modify: `src/domain/cable-geometry.ts`
- Modify: `src/domain/exposed-wire-endpoints.ts`
- Modify: `src/domain/__tests__/cable-geometry.test.ts`

- [ ] **Step 1: Write test — breaker cable wires have no exposed display path**

- [ ] **Step 2: In `refreshCablePaths` / `defaultExposedPath` callers**

If `isBreakerCable(cable)`: skip creating/updating `exposedPaths` for its wires; delete any stale entries.

- [ ] **Step 3: In `exposed-wire-endpoints.ts`**

Return null for breaker cable wire endpoints (nothing linkable on panel side).

- [ ] **Step 4: Run tests — PASS**

---

### Task 5: Conduit runs — cable-only termination

**Files:**
- Modify: `src/domain/conduit-run-mutations.ts`
- Modify: `src/domain/conduit-run-geometry.ts`
- Modify: `src/domain/__tests__/conduit-run-mutations.test.ts`

- [ ] **Step 1: Update tests to use breaker `Cable` instead of `BreakerConduit`**

Replace `addBreakerConduit` / `connectConduitRunToBreaker` with:
- `addCable` on panel (breaker role)
- `connectConduitRun(diagram, fieldCableId, breakerCableId)`

- [ ] **Step 2: Rewrite `connectConduitRunToBreakerAnchor`**

```ts
export function connectConduitRunToBreakerAnchor(
  diagram: Diagram,
  fromCableId: string,
  junctionBoxId: string,
  anchor: AnchorPosition,
): Diagram {
  // ... validate breaker panel, anchor not taken by junction cable ...
  let next = diagram;
  let breakerCable = next.cables.find(
    (c) => c.junctionBoxId === junctionBoxId && c.anchor === anchor && isBreakerCable(c),
  );
  if (!breakerCable) {
    const wireColors = orderedWireColorsForMultiset(multisetFromCableWires(next, fromCable));
    next = addCable(next, { junctionBoxId, anchor, wireColors });
    breakerCable = next.cables.find(/* same predicate */)!;
  }
  return connectConduitRun(next, fromCableId, breakerCable.id);
}
```

- [ ] **Step 3: Remove `connectConduitRunToBreaker`, `breakerId` handling, `pairWireIdsForCableAndBreaker` conduit branch**

Pairing becomes symmetric cable↔cable (reuse existing `connectConduitRun` logic).

- [ ] **Step 4: Run conduit-run-mutations tests — PASS**

---

### Task 6: Continuity & direction gating

**Files:**
- Modify: `src/domain/continuity.ts`
- Modify: `src/domain/direction.ts`
- Modify: `src/domain/__tests__/continuity.test.ts`
- Modify: `src/domain/__tests__/direction.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it('open breaker cable isolates field conductors in continuity', () => {
  // panel breaker cable (closed: false) + conduit run to field cable + link on field side
  // assert field wires NOT in same UF component as would-be panel feed
});

it('open breaker cable does not seed direction', () => {
  // same setup; resolveDirections → breaker cable wires have null resolvedDirection
});
```

- [ ] **Step 2: Replace `isBreakerConduit` / `run.breakerId` branches**

In conduit-run pairing: only add adjacency when **both** cables exist and **any breaker cable on the run** has `breakerCableClosed(c)`.

In direction seeds: iterate `diagram.cables.filter(isBreakerCable)` where `breakerCableClosed(c)`; seed wire directions via `directionForBreakerWire`.

Remove `diagram.breakers` seed loop once migration clears the array.

- [ ] **Step 3: Run continuity + direction tests — PASS**

---

## Phase 3 — Migration & cleanup

### Task 7: Migrate BreakerConduit → breaker Cable

**Files:**
- Modify: `src/domain/cable-migration.ts`
- Modify: `src/domain/migrate-breakers.ts`
- Modify: `src/domain/normalize.ts`
- Modify: `src/domain/__tests__/normalize.test.ts`

- [ ] **Step 1: Write test with legacy `BreakerConduit` + `ConduitRun.breakerId`**

Expected after normalize:
- One `Cable` with `role: 'breaker'`, `closed: true`
- Run has `cableIdB` set, no `breakerId`
- No `kind: 'breaker'` conduits remain

- [ ] **Step 2: Implement migration function `migrateBreakerConduitsToCables`**

For each `BreakerConduit`:
1. Create `Cable` with same id **or** new id (prefer **new cable id**, re-point wires — document choice in code comment; use new id to avoid id collision with conduits)
2. Move wires: `cableId = cable.id`, `conduitId = null`
3. Delete `conduitPaths[conduitId]`
4. Remove conduit from `conduits`

For each run with `breakerId`:
- Find migrated breaker cable at that conduit’s anchor
- Set `cableIdB` (or swap so field cable is A)
- Delete `breakerId` property

- [ ] **Step 3: Update `migrateLegacyBreakers` to emit breaker cables directly**

- [ ] **Step 4: Call from `normalize.ts` after existing cable migration**

- [ ] **Step 5: Run normalize tests — PASS**

---

### Task 8: Remove legacy breaker APIs

**Files:**
- Modify: `src/domain/mutations.ts`
- Delete: `src/domain/breaker-conduit.ts`
- Modify: `src/domain/index.ts`
- Modify: `src/domain/cable-mutations.ts` (remove `isBreakerSeededWire` imports)
- Modify: `src/domain/__tests__/mutations.test.ts`
- Modify: `src/domain/__tests__/delete.test.ts`

- [ ] **Step 1: Remove `addBreakerConduit`, `addBreaker`**

Replace `isBreakerSeededWire` with helper checking `wire.cableId` → breaker cable.

- [ ] **Step 2: Update delete guards**

Breaker cable wires deleted only when whole cable deleted (same as today’s breaker conduit rule).

- [ ] **Step 3: Fix all remaining imports of `breaker-conduit.ts` → `breaker-cable.ts`**

- [ ] **Step 4: Delete `breaker-conduit.ts`**

- [ ] **Step 5: Full test suite — PASS**

Run: `npm test`

---

## Phase 4 — Canvas & editor

### Task 9: Breaker toggle rendering

**Files:**
- Create: `src/canvas/BreakerToggle.tsx`
- Modify: `src/canvas/CableLayer.tsx`
- Modify: `src/styles/app.css`

- [ ] **Step 1: Create `BreakerToggle` component**

Props: `x`, `y`, `closed`, `selected`, `onDoubleClick`.

Render ~36×24px rounded rect with "ON" / "OFF" text (match switch state styling).

- [ ] **Step 2: In `CableLayer`, for `isBreakerCable(cable)`**

- Do not render exposed wire paths for its wires
- Render `BreakerToggle` at `cableCenterPoint` offset inward ~40px along inward normal

- [ ] **Step 3: Add CSS classes `.breaker-toggle`, `.breaker-toggle--closed`, `.breaker-toggle--open`**

---

### Task 10: Editor wiring — remove K, enable toggle

**Files:**
- Modify: `src/screens/EditorScreen.tsx`
- Modify: `src/editor/Toolbar.tsx`
- Modify: `src/editor/editor-tools.ts`
- Modify: `src/editor/editor-shortcuts.ts`
- Modify: `src/canvas/DiagramSvg.tsx`

- [ ] **Step 1: Remove `conduit-breaker` tool**

Delete K button, shortcut, helper strings, `handleBreakerConduitConfirm`, breaker dialog kind (panel placement uses cable dialog).

- [ ] **Step 2: Allow `tool === 'cable'` on breaker panel anchors**

Open cable dialog with same preset UI (twoWire / threeWire wire colors).

- [ ] **Step 3: Wire double-click on breaker toggle**

When `tool === 'select'`, call `toggleBreakerCable(diagram, cableId)`.

- [ ] **Step 4: Update helper text**

C on panel: "Add breaker circuit cable…"  
E to panel: "…creates breaker cable if needed…"

---

### Task 11: Inspector for breaker cables

**Files:**
- Modify: `src/editor/Inspector.tsx`
- Modify: `src/editor/ConduitDialog.tsx` (if still used for panel)

- [ ] **Step 1: When selected entity is breaker cable**

Show title "Breaker circuit", On/Off toggle button, label field, wire count/colors (reuse cable inspector controls).

- [ ] **Step 2: Remove standalone "Breaker circuit" conduit inspector section**

- [ ] **Step 3: Manual smoke test in dev server**

---

## Phase 5 — Verification

### Task 12: Full verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`  
Expected: all pass

- [ ] **Step 2: Run production build**

Run: `npm run build`  
Expected: success

- [ ] **Step 3: Manual checklist**

- C on empty panel anchor → breaker cable with toggle ON, conduit stub outward
- E from field cable to empty panel anchor → auto breaker cable + run
- Double-click toggle OFF → opposed-flow / continuity reflects de-energized field
- Toggle ON → direction arrows seed from panel
- K tool absent from toolbar
- Legacy diagram with BreakerConduit loads and migrates

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `Cable.role` / `closed` | Task 1, 2 |
| Remove `BreakerConduit`, `breakerId` | Task 1, 5, 8 |
| C on panel creates breaker cable | Task 3, 10 |
| E auto-creates breaker cable | Task 5 |
| No exposed wires on panel side | Task 4, 9 |
| Toggle canvas + inspector | Task 9, 10, 11 |
| OFF = open continuity + no direction | Task 6 |
| ON = pairing + seeds | Task 6 |
| Remove K tool | Task 10 |
| Migration | Task 7 |

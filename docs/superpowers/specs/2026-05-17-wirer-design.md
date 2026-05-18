# Wirer — Electrical Wiring Mapper Design Spec

**Date:** 2026-05-17  
**Status:** Approved (approach A, design sections 1–4)

## Purpose

Wirer is a responsive web app for mapping electrical wiring while tracing circuits with a multimeter and wireless continuity sensor. Users place junction boxes on an infinite canvas, attach conduits with colored wires, connect wires across boxes, and propagate direction from breakers through the connectivity graph.

## Decisions (brainstorming)

| Area | Decision |
|------|----------|
| Topology | Local conduits at box anchors, optional inter-box conduit runs (node-to-node), plus direct wire-to-wire links |
| Platform | Responsive web (phone + desktop) |
| Canvas | One infinite diagram per job |
| Persistence | Auto-save (IndexedDB) + export/import `.wirer` JSON files |
| Direction UI | Always-visible chevrons on directed wires |
| Jobs | In-app library + open/import external files |
| Labels | Optional on junction boxes, conduits, and wires; auto-generated defaults |
| Implementation | React + TypeScript + custom SVG canvas (not React Flow) |

## Domain model

### Job

```ts
interface Job {
  id: string;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  diagram: Diagram;
}
```

### Diagram

```ts
interface Diagram {
  junctionBoxes: JunctionBox[];
  breakers: Breaker[];
  conduits: Conduit[];
  wireLinks: WireLink[];
  layout: LayoutState;
}
```

### Junction box

- Rectangle on canvas with position `(x, y)` and size `(width, height)`.
- **Nine anchors** at fixed relative positions: four corners, four edge midpoints, center.
- `type`: `normal` | `breaker`.
- Exactly **one** breaker box per diagram, created automatically on new job (cannot delete; can reposition).
- Optional `label`; default `J-box N` or `Breaker panel`.

```ts
type AnchorPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

interface JunctionBox {
  id: string;
  type: 'normal' | 'breaker';
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
```

### Breaker

- Lives inside the breaker box only.
- Single terminal node with **two wires**:
  - **Black:** direction `away` (away from breaker).
  - **White:** direction `toward` (toward breaker).
- Wires are first-class `Wire` entities referenced by `breakerId`.
- Optional `label`; default `Breaker N`.

```ts
interface Breaker {
  id: string;
  junctionBoxId: string; // must reference breaker-type box
  label: string;
  blackWireId: string;
  whiteWireId: string;
}
```

### Conduit

Two variants:

1. **Local** — attached to one junction box anchor.
2. **Span** — connects anchor on box A to anchor on box B (inter-box run).

Contains an ordered list of wires (variable count, colors chosen at creation).

```ts
type WireColor = 'red' | 'white' | 'black';

interface Wire {
  id: string;
  color: WireColor;
  label: string; // default e.g. "Black #2"
  conduitId: string | null; // null only for breaker-owned wires
  breakerId: string | null;
  manualDirection: WireDirection | null; // user override when not breaker-locked
}

type WireDirection = 'toward' | 'away'; // semantic relative to wire geometry

interface ConduitBase {
  id: string;
  label: string;
  wireIds: string[];
}

interface LocalConduit extends ConduitBase {
  kind: 'local';
  junctionBoxId: string;
  anchor: AnchorPosition;
}

interface SpanConduit extends ConduitBase {
  kind: 'span';
  junctionBoxIdA: string;
  anchorA: AnchorPosition;
  junctionBoxIdB: string;
  anchorB: AnchorPosition;
}

type Conduit = LocalConduit | SpanConduit;
```

### Wire link

- Undirected connection between two wires (many-to-many allowed).
- Color-agnostic (any color may connect to any color).
- Stored as unordered pair `{ wireIdA, wireIdB }` (canonical sort by id).

```ts
interface WireLink {
  id: string;
  wireIdA: string;
  wireIdB: string;
  whiteMismatchWarning: boolean; // true if one wire white and other not
}
```

### Layout

- Box positions/sizes.
- Optional polyline control points for conduit visual paths and wire link jump lines (auto-routed initially; user may adjust later in v2 — v1 uses straight lines anchor-to-anchor).

```ts
interface LayoutState {
  conduitPaths: Record<string, { points: { x: number; y: number }[] }>;
  wireLinkPaths: Record<string, { points: { x: number; y: number }[] }>;
}
```

## Behavior

### Creating entities

| Action | Behavior |
|--------|----------|
| New job | Creates diagram with auto breaker box at default position |
| Junction box | Toolbar → place on canvas; drag handles to resize |
| Breaker | "+ Breaker" in breaker box only; creates black + white wires with fixed directions |
| Local conduit | Click anchor → dialog: wire count + per-wire color → creates conduit + wires |
| Span conduit | Click anchor A → click anchor B (different box) → same wire dialog |
| Wire link | "Connect" mode: tap wire A, wire B; repeat for additional links |
| Labels | Inspector or double-tap; empty uses generated default |

### Direction propagation

1. **Seeds:** Breaker black = `away`, breaker white = `toward`. User may set `manualDirection` on any non-breaker-locked wire.
2. **Groups:** Wire links form undirected connected components (equipotential groups).
3. **Propagation:** BFS from all seeds within each component. A directed seed assigns direction to connected wires consistent with graph traversal along wire polylines.
4. **Resolved direction:** Each wire gets `resolvedDirection: WireDirection | null` and `directionSource: 'breaker' | 'manual' | 'propagated' | null`.
5. **Conflicts:** If two seeds impose incompatible directions on the same wire → `directionConflict: true` (red outline, listed in Issues panel).
6. **Breaker-locked wires:** `manualDirection` ignored; direction always from breaker definition.

### Warnings

- **White ↔ non-white link:** On connect, set `whiteMismatchWarning: true` on link; show amber banner once; persistent ⚠ on link graphic. Does not block save.
- **Direction conflict:** Blocking visual only (user must fix topology or remove manual direction).

### Rendering

- Junction box: rectangle + 9 visible anchor dots (larger hit area on touch).
- Conduit: bundled lines from anchor(s); span conduits draw between two boxes.
- Wire: stroke color matches `WireColor` (red/white/black CSS).
- **Chevrons:** Always rendered on wires with `resolvedDirection !== null`, spaced along polyline.
- Wire link: dashed jump or splice icon between wire endpoints.

## UI structure

### Home screen

- List jobs from IndexedDB (name, `updatedAt`).
- Actions: New job, Open `.wirer` file, Delete job.
- Import: parse file → add to library or open as new job.

### Editor screen

- Infinite pan/zoom SVG canvas (center origin optional).
- **Toolbar:** select, add junction box, add conduit, connect wires, add breaker (contextual).
- **Inspector** (side/bottom sheet on mobile): selection properties, label, manual direction, delete.
- **Issues panel:** direction conflicts + white-mismatch links.

### Responsive

- Phone: inspector as bottom sheet; 44px min touch targets on anchors.
- Desktop: inspector sidebar; keyboard shortcuts (Delete, Esc cancel mode).

## Persistence

### Auto-save

- Debounced write to IndexedDB on diagram mutation (300ms).
- Key: `jobs/{jobId}`.

### Export / import

- File extension: `.wirer`
- Format: JSON with `schemaVersion: 1`, full `Job` object.
- Export: download blob from editor or home row action.
- Import: File picker → validate schema → upsert into IndexedDB.

### No cloud sync in v1.

## File schema (export)

```json
{
  "schemaVersion": 1,
  "job": { "...": "Job object" }
}
```

## Non-goals (v1)

- Cloud accounts / multi-user sync
- Floor plans or background images
- Multiple canvases per job
- Automatic NEC compliance checking
- Undo/redo (nice-to-have v2)

## Testing priorities

- Domain: wire link graph, direction propagation, conflict detection, white-mismatch flagging
- Persistence: round-trip export/import, schema validation
- UI: smoke tests for create box → conduit → link (Playwright optional v1.1)

## Tech stack

- **App:** Vite + React 19 + TypeScript
- **State:** Zustand (or React context + reducers) holding `Job` / `Diagram`
- **Storage:** `idb` wrapper for IndexedDB
- **Render:** SVG in panned/zoomed `<g transform>` with custom components
- **Tests:** Vitest (domain), optional Vitest + Testing Library (components)

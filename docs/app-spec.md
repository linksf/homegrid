# Wirer — Application Specification

A complete, implementation-oriented description of **Wirer**, an electrical wiring–diagram editor. This document is intended to be sufficient to recreate the app from scratch. It covers the product concept, terminology, data model, electrical simulation, geometry/routing, rendering, editor interaction, and persistence.

See also `docs/glossary.md` for a quick term reference.

---

## 1. What the app is

Wirer is a browser-based, single-page **electrical wiring diagram editor**. A user lays out junction boxes, devices (lights, switches, dimmers, outlets), and the conductors that connect them, then the app **simulates** the circuit: which lights are lit, which outlets are energized, and which way current flows along each wire. Diagrams ("jobs") are saved to the cloud (Firebase Storage) or locally (IndexedDB), and can be exported/imported as portable `.wirer` JSON files.

The product is **diagram-first and simulation-aware**, not a SPICE-style analog simulator: it models *connectivity* (continuity), *energization* (is this reachable from a hot + neutral?), and *flow direction* (toward/away from the panel), which it visualizes with colored conductors and flow chevrons.

### Core value
- Draw realistic residential wiring (panel → cables/conduit → boxes → devices).
- Get live feedback: lit bulbs, energized outlets, current-direction arrows.
- Catch mistakes: direction conflicts and "opposing flow" splices are surfaced in an Issues panel.

---

## 2. Technology stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict) |
| UI framework | React 19 |
| Build/dev | Vite |
| State | Zustand (single store) |
| Rendering | Hand-rolled **SVG** (no canvas/WebGL, no charting lib) |
| Persistence | Firebase Storage (cloud) / IndexedDB via `idb` (local) / in-memory (tests) |
| IDs | `nanoid` |
| Tests | Vitest + Testing Library + `fake-indexeddb` + jsdom |
| Hosting | Firebase Hosting |

No CSS framework — styling is a hand-written stylesheet (`src/styles/app.css`) using CSS custom properties (e.g. `--wire-red`, `--wire-black`, `--wire-white`).

### Project layout
```
src/
  domain/        Pure model + simulation + geometry/routing (no React)
  canvas/        SVG presentation, hit-testing, drag UX
  editor/        Tools, selection, inspector, toolbar, dialogs
  store/         Zustand store + undo/redo history
  persistence/   Backends (firebase/indexeddb/memory), file I/O, schema
  screens/       HomeScreen (library), EditorScreen (workspace)
  firebase/      Config + lazy app/storage init
  components/    Small shared widgets (e.g. JobNameField)
```
Keep `domain/` free of React so it is unit-testable and reusable.

---

## 3. Terminology (domain vocabulary)

These are the names used throughout the model. Recreate them faithfully — the whole codebase keys off them.

### Containers
- **Job** — A saved document: `{ id, name, notes, createdAt, updatedAt, diagram }`.
- **Diagram** — The full wiring document (boxes, devices, conductors, connectivity, plus a `layout`).
- **LayoutState** — Persisted *geometry*: the editable orthogonal paths and sideways offsets for everything that's drawn.

### Structure
- **JunctionBox** — A rectangle on the diagram; `type: 'normal' | 'breaker'`. The breaker box represents the panel.
- **AnchorPosition** — One of 9 fixed attach points on a box: `top-left`, `top-center`, `top-right`, `middle-left`, `center`, `middle-right`, `bottom-left`, `bottom-center`, `bottom-right`.
- **Room** — Visual-only floor-plan rectangle with optional **RoomDoor**s (wall + offset + width). Does **not** affect simulation.

### Conductors and bundles
- **Wire** — A single conductor with a `color` (`black | white | red`), a `label`, and at most one *container* attachment (`cableId` **or** `conduitId`) plus optional `hubId` and/or `deviceNodeId`, plus a `manualDirection`.
- **WireColor** — `black | white | red` (hot / neutral / traveler-or-second-hot).
- **WireDirection** — `toward` or `away` (relative to the wire's own polyline; see §5b).
- **Cable** — A bundle of **1–3** conductors attached to one box anchor (`wireIds`). Has `role: 'junction' | 'breaker'`. Breaker cables represent a panel feed and carry a `closed` flag (ON/OFF) and render a toggle instead of exposed wires.
- **ConduitRun** — A physical conduit/sheath connecting **two cable stubs** (`cableIdA` / `cableIdB`); pairs conductors by color.
- **Conduit** (legacy) — Older bundle shapes: `local`, `span`, `device`, `hub`. On load these are migrated to cables + conduit runs (device/hub kinds are retained).
- **WireLink** — A direct splice between two wire **endpoints**: `{ wireIdA, endpointA, wireIdB, endpointB }` where endpoint ∈ `start | end`.
- **WireEndpoint** — `start` or `end` of a wire's path.

### Splices / interconnects
- **Hub** — A splice point inside a junction box (fixed **HubSlot** 0–3, max 4 per box); ties many wires together.
- **HubBridge** — Connects two hubs in *different* boxes.

### Devices and terminals
- **DeviceNode** — A *terminal* on a device, identified by `(deviceKind, deviceId, slot)`. Continuity and direction operate on terminals, not whole devices. Many wires can share one terminal.
- **LightBulb** — Two-terminal load.
- **Switch** — 2/4-terminal device with `terminalCount: 2 | 3 | 4` and a `position`:
  - Single-pole (2): `open | closed`
  - Three-way (3): `travelerA | travelerB` (common is slot 0)
  - Four-way (4): `straight` (0↔2, 1↔3) or `cross` (0↔3, 1↔2)
- **DimmerSwitch** — Two terminals (line slot 0, load slot 1) with a `level` 0–100 (0 = off).
- **Outlet** — Duplex; hot (slot 0) + neutral (slot 1). Optionally **passthrough** with 4 terminals (hot in/out 0↔1, neutral in/out 2↔3).

### Electrical semantics
- **ResolvedWire** = `Wire & { resolvedDirection, directionConflict, directionSource }` where `directionSource ∈ breaker | manual | propagated | null`.
- **Continuity** — Electrical connectedness, computed via union-find over `w:{wireId}` and `t:{deviceNodeId}` keys.
- **Breaker seed** — The panel-side origin of hot/neutral that seeds energization and direction.

---

## 4. Data model (TypeScript shapes)

Reproduce these interfaces (abbreviated). All collections live on `Diagram`; geometry lives on `Diagram.layout`.

```ts
type WireColor = 'red' | 'white' | 'black';
type WireDirection = 'toward' | 'away';
type AnchorPosition = 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

interface JunctionBox { id; type: 'normal'|'breaker'; label; x; y; width; height; }
interface Wire {
  id; color: WireColor; label;
  conduitId: string|null; cableId: string|null; breakerId: string|null;
  hubId: string|null; deviceNodeId: string|null;
  manualDirection: WireDirection|null;
}
interface DeviceNode { id; deviceKind: 'lightBulb'|'switch'|'dimmerSwitch'|'outlet'; deviceId; slot: number; }
interface LightBulb { id; label; x; y; }
interface Switch { id; label; x; y; width; height; terminalCount: 2|3|4; position?; }
interface DimmerSwitch { id; label; x; y; width; height; level?: number; position?; }
interface Outlet { id; label; x; y; width; height; passthrough: boolean; }
interface Hub { id; junctionBoxId; label; slot: 0|1|2|3; }
interface HubBridge { id; hubIdA; hubIdB; }
interface Cable { id; junctionBoxId; anchor: AnchorPosition; wireIds: string[]; label?; role?: 'junction'|'breaker'; closed?: boolean; }
interface ConduitRun { id; cableIdA; cableIdB: string|null; wireIds: string[]; }
interface WireLink { id; wireIdA; endpointA: WireEndpoint; wireIdB; endpointB: WireEndpoint; }
interface Room { id; label; x; y; width; height; doors: RoomDoor[]; }

interface LayoutState {
  conduitPaths; exposedPaths?; conduitStubPaths?; conduitRunPaths;
  conduitOffsets?; wireOffsets?; wirePaths?; wireLinkPaths;
  hubWirePaths?; deviceWirePaths?; wireLinkOffsets?; hubBridgePaths;
} // every *Paths value is { points: {x,y}[] }; every *Offsets value is { dx, dy }

interface Diagram {
  rooms; junctionBoxes; breakers /* legacy */; hubs; hubBridges;
  lightBulbs; switches; dimmerSwitches; outlets; deviceNodes;
  conduits; cables; conduitRuns; wires; wireLinks; layout;
}
interface Job { id; name; notes; createdAt; updatedAt; diagram; }
```

Notes:
- A wire belongs to a cable **xor** a conduit, and may *additionally* terminate on a hub and/or a device terminal.
- `breakers[]` and `conduits[]` of kind `local`/`span`/`breaker` are **legacy**; they are migrated on load (see §9). New work uses `cables` + `conduitRuns` (+ device/hub conduits).
- A new job (`createEmptyJob`) starts with exactly one **breaker-panel** junction box and otherwise empty collections.

---

## 5. Electrical simulation

Two independent computations run over the diagram. Both are pure functions of `Diagram`.

### 5a. Continuity (`buildContinuityFinder`)
A **union-find** (disjoint set) over node keys:
- `w:{wireId}` for every wire, `t:{deviceNodeId}` for every terminal.

Union rules:
| Connection | Union |
|---|---|
| Hub splice | all wires sharing a `hubId`, pairwise — **only if `hubWirePairAllowed`** |
| Hub bridge | every wire on hub A × every wire on hub B |
| Wire link | `wireIdA` ↔ `wireIdB` |
| Conduit run | same-color FIFO pairing (order black, white, red) across cable A/B wires; skipped if a breaker cable on either side is open |
| Wire → terminal | wire ↔ its `deviceNodeId` |
| Device conduit | each conduit wire ↔ the device terminal |
| Light bulb | its two terminals are always tied |
| Switch | pairs from `switchConnectedSlots` (depends on position) |
| Dimmer | `[0,1]` when `level > 0` |
| Outlet | passthrough only: hot `[0,1]`, neutral `[2,3]` |

`hubWirePairAllowed` blocks splicing two *different* terminals of the same switch/dimmer through a hub (you must use the device's internal path), while allowing unrelated wires and outlet passthrough.

**Derived queries:**
- `breakerSeedGroups` — hot network (breaker black/red, breaker-cable black/red) and neutral network (white).
- `lightBulbBrightness(0–100)` / `isLightBulbLit` — both bulb terminals must reach hot and neutral respectively; series dimmers on the hot path apply the **minimum** level.
- `isOutletEnergized` — hot slot reaches hot network and neutral slot reaches neutral network.

### 5b. Current direction (`resolveDirections`)
Returns `Map<wireId, ResolvedWire>`. Direction is defined **relative to each wire's own polyline**: `away` = flow from path `start`→`end`, `toward` = `end`→`start`.

**Seeds** (per connected component):
1. Legacy breakers: black `away`, white `toward`.
2. Closed breaker cables: black/red `away`, white `toward`.
3. Any non-breaker wire with a `manualDirection`.

**Propagation graph** — build an adjacency list of wire↔wire edges, each with a `flip` boolean, then BFS from seeds. A neighbor's direction is the same (`flip=false`) or inverted (`flip=true`):

| Edge | flip | Why |
|---|---|---|
| Wire link | **true** | Two wires meet tip-to-tip; one flows in, the other out |
| Conduit run (same color) | **true** | Both cable wires run wall→interior and join at the wall/stub side, so one is `toward`, the other `away` |
| Hub splice / hub bridge | false | Common node |
| Switch / dimmer (on) | **true** | In one terminal, out the other |
| Passthrough outlet | false | Hot/neutral pass straight through |

> Critical invariant: **wire links and conduit runs both use `flip = true`.** Mixing a `true` rule with a `false` rule on the same conductor was a real bug that reversed chevrons; keep them consistent so a conductor traced through a link *and* a run keeps one continuous arrow direction.

**Conflicts:** if two seeds disagree, or propagation reaches a wire with a contradictory value, the entire component is marked `directionConflict: true`.

**Link flow helpers** (`wire-link-utils.ts`):
- `flowExitsWireAtEndpoint(dir, endpoint)` — does flow leave the wire into the link at that endpoint.
- `wireLinkFlowDirection(link, resolvedA, resolvedB)` — direction to render along the link's A→B polyline (geometry-aware, accounts for which endpoints are joined).
- `isDirectionOpposedLink(...)` — true only when **both** wires push into the link (a head-on collision). **White-to-white (neutral) splices are never flagged** — neutrals share a return path.

---

## 6. Geometry & orthogonal routing

All connections render as **orthogonal (Manhattan) polylines** with a fixed vertex count, so they can be edited by dragging interior "joint" handles while endpoints stay pinned.

### Constants
- `GRID_SIZE = 12` world units (everything snaps to this).
- Junction boxes snap to **even** cell counts so 50% anchors land on intersections.
- Fixed vertex counts: wires/stubs/exposed = **4**; span wires + conduit stubs = **5**; links/hub-wires/bridges/device-wires/conduit-runs = **5**.
- Stub lengths: local/exposed = 4 cells; breaker stub = 12 cells. Lane spacing for parallel links = 14; bundle tip spacing = 16; nudge step = 12.

### Path families (each stored in a `layout.*Paths` map, keyed by id)
- **Exposed cable wires** (`exposedPaths`) — from a wall slot **inward** into the box. `start` = wall slot (fixed), `end` = interior tip (free/linkable).
- **Conduit stubs** (`conduitStubPaths`) — the cream sheath emanating **outward** from a cable's center.
- **Conduit runs** (`conduitRunPaths`) — 5-point path between two stub outer tips.
- **Per-wire conduit paths** (`wirePaths`) and legacy **conduit centerlines** (`conduitPaths`).
- **Wire links** (`wireLinkPaths`), **hub wires** (`hubWirePaths`), **hub bridges** (`hubBridgePaths`), **device wires** (`deviceWirePaths`).
- **Offsets** (`*Offsets`) — a sideways `{dx,dy}` nudge layered on top of routed geometry.

### Key helpers
- `orthogonalRoute(a, b)` — L-shaped route. `conduitStubPath(start, outward, len)` — stub then turn.
- `defaultFourPointPath` / `defaultFivePointPath`, `normalizeWirePath`, `pinPathEndpoints`, `dragFixedVertex`, `draggable*VertexIndices` (which interior vertices may move), `simplifyOrthogonalPath`.
- `cableWallSlots(box, anchor, count)` — 1–3 grid-aligned slots along the wall.
- `anchorPoint(box, anchor)` — world point of one of the 9 anchors.
- `resolveExposedCableWirePath`, `conduitStubResolvedPath`, `conduitRunDisplayPath`, `wireLinkDisplayPath`, `wireWorldPolyline` — produce the live polyline for rendering (recompute from current positions so geometry tracks moving boxes in real time).
- `refreshCablePaths`, `refreshConduitRunPaths`, `refreshWireLinkPaths`, `refreshHubWirePaths`, `refreshHubBridgePaths`, `refreshDeviceWirePaths`, `ensureWirePaths` — rebuild defaults while preserving custom shapes/free ends.

> Rendering must use the **resolved/recomputed** path functions (not the raw stored `*DisplayPath` snapshots) so wires and stubs follow a junction box while it is being dragged.

---

## 7. Rendering (SVG layers)

The canvas is a single `<svg>` with a large viewBox (world ≈ `-800 -600 5200 4000`) and one inner `<g transform="translate(tx,ty) scale(s)">` holding all world-space content. Scale clamps **0.25–16**.

### Layer paint order (back → front)
1. **DiagramGrid** — grid lines every `GRID_SIZE`.
2. **RoomShape** ×N — floor-plan outlines (below wiring).
3. **ConduitLayer** (under boxes) — non-local/span conduit bundles.
4. **ConduitRunLayer** — conduit sheaths + cable stubs (tan/cream).
5. **JunctionBoxShape** ×N — box, 9 anchor circles, hub slot markers, nested HubShape, corner resize handles.
6. **CableLayer** — wall-exposed cable wires, footprint hit areas, breaker toggles.
7. **ConduitLayer** (hub kind, over boxes).
8. **DeviceConnectionLayer** — orthogonal device↔wire ties.
9. **HubConnectionLayer** — hub wire stubs + hub bridges.
10. **Device shapes** — LightBulb, Switch, DimmerSwitch, Outlet (+ DeviceNodeMarker terminals).
11. **ConduitLayer** (device kind, over devices).
12. **WireLinkLayer** — wire-to-wire links.
13. **WireHitLayer** — transparent fat strokes for picking conduit wires.
14. **WireEndpointHitLayer** — endpoint targets (connect tool only).
15. **PathEditLayer** — joint handles for the sole selected item.
16. **PathAnchorEditLayer** — handles for marquee-selected path anchors.
17. **DiagramLabelsLayer** — all labels (single pass, on top).
18. **SelectionMarquee** — drag rectangle.
19. **Placement overlay** — full-sheet pointer capture for placement tools.

`ConduitLayer` is rendered three times at different depths so box-interior wiring sits under boxes while device-attached conduits sit on top of devices.

### Visual conventions
- Conduit/cable **wires**: CSS classes `wire-stroke--{red|black|white}` (≈5.5px; 7.5px when selected/pending).
- **Links & hub ties**: inline hex stroke from `wire-colors.ts` (`red #c62828`, `black #1a1a1a`, `white #f5f5f5`); white gets a drop-shadow; two-color links use an **alternating dashed** pattern.
- **Flow chevrons** (`WireChevronPath`): yellow/gold triangles placed every 56px (28px on compact links) along the polyline; reversed for `toward`; turn **red** on `directionConflict`; `pointer-events: none`.
- **Conduit runs/stubs**: tan sheath, not wire-colored.
- **Labels** (`ZoomLabel`): counter-scale by `1/scale` so text stays a constant screen size; size from `LabelSizeContext` (default ~60px, clamped 32–112).
- Selection = blue glow; pending connect = amber; opposing-flow link = amber `!` badge at midpoint.

---

## 8. Editor: tools, selection, interaction

### Screens
- **HomeScreen** — job library: list (sorted by `updatedAt`), New job, Open, rename inline, delete, multi-select export/delete, import `.json`/`.wirer`.
- **EditorScreen** — header (← Library, editable job name), Toolbar, canvas, collapsible side panel (Issues + Label settings + Inspector), footer hint per tool. Selection and tool state are **local React state**, not global.

### Tools (`EditorMainTool`) and shortcuts
| Tool | Shortcut | Action |
|---|---|---|
| `select` | **V** | click-select, marquee, drag, resize, delete |
| `pan` | **H** | drag to pan |
| `place-junction` | **B** | tap → junction box |
| `place-room` | **M** | tap → room |
| `place-light-bulb` | **L** | tap → light |
| `place-switch` | **S** | tap → switch (variant: single-pole / three-way / four-way / dimmer) |
| `place-outlet` | **O** | tap → outlet (standard / passthrough) |
| `cable` | **C** | tap anchor/terminal/hub → conduit dialog |
| `conduit-connect` | **E** | connect two cable stubs (or stub → anchor/breaker) into a ConduitRun |
| `connect-wires` | **J** | two-click linking: wire↔wire, wire↔hub, hub↔hub (bridge), hub/wire↔device terminal |

Also: **T** toggles labels; **Shift+drag** = temporary pan; **Esc** = back to Select / cancel pending; **Delete/Backspace** = delete selection; **↑/↓** = adjust the selected dimmer's level. Undo **⌘Z**, redo **⇧⌘Z**/**⌘Y**.

### Selection model
A `DiagramSelection` holds a `Set<string>` per category: rooms, junctionBoxes, wires, conduits, conduitRuns, cables, hubs, hubBridges, links, lightBulbs, switches, dimmerSwitches, outlets, deviceNodes, plus encoded `junctionAnchors` (`jb:{box}:{anchor}`) and `pathAnchors` (encoded path-bend keys).

### Marquee
Left-drag on empty canvas (Select tool). Drag **left→right = crossing** (selects anything intersected, blue solid); **right→left = window** (only fully-enclosed, green dashed). Border uses non-scaling stroke. Selecting a device also selects its terminals; selecting a box also selects its hubs.

### Move / resize / edit
- Group-drag moves all selected items of a kind; junction boxes can also be dragged by an anchor.
- Path bends: drag joint handles (sole selection) or multi-anchor handles (marquee).
- All drags apply with `{ history: false }` during the drag and call `commitDiagramHistory()` on pointer-up so one drag = one undo step.

### Inspector (context-sensitive, for the sole selection)
Edits labels and per-type properties: wire manual direction + detach; link/ bridge info + delete; hub label + attached wires; cable wires/anchor/breaker toggle; junction box (add hub / add breaker cable); device simulation controls (switch position, dimmer level, outlet passthrough, terminals) ; room doors. Multi-select shows counts and a Delete action.

### Issues panel
Lists (1) **direction conflicts** (wires with `directionConflict`) and (2) **opposing flow** links (`isDirectionOpposedLink`). Rows select the offending item on canvas.

### Conduit/cable dialog
Modal for placing cable (1–3 wires, color each), breaker feed (2- or 3-wire preset), device conduit (1 wire), or hub conduit (1–12 wires).

---

## 9. Normalization & migration (on load)

Every job passes through `normalizeJob → normalizeDiagram` on read/write so old files upgrade cleanly. Pipeline:

1. Coerce schema / default empty arrays; normalize wire fields.
2. `migrateWireLinks` (canonical endpoint ordering) + `dedupeWireLinks`.
3. `migrateLegacyBreakers` — `breakers[]` → breaker-role `Cable`s.
4. `normalizeHubSlots` — legacy u/v coords → fixed slots 0–3.
5. `normalizeDeviceNodes` — ensure correct terminals per device, normalize device state, detach orphan wires, prune invalid device conduits.
6. `snapDiagramToGrid`.
7. Rebuild paths: `ensureWirePaths`, `rebuildConduitPathsPreservingFreeEnds`, `rebuildWirePathsPreservingTips`, `orthogonalizeLayoutPaths`.
8. `migrateConduitsToCables` — local conduit → cable; span conduit → cable at each end + a `ConduitRun`, remapping wire links to the far-side clones.
9. `migrateBreakerConduitsToCables`.
10. Refresh link/hub/bridge/device paths; `pruneLayoutOffsets`.

---

## 10. Persistence

- **`JobsBackend`** interface: `listJobs()`, `getJob(id)`, `putJob(job)`, `deleteJob(id)`. All jobs run through `normalizeJob` on read/write.
- **Backend selection** (once, at first use): tests → memory; else if Firebase env is fully configured → Firebase Storage; else → IndexedDB (with a console warning). It is config-based, **not** a runtime fallback chain.
- **Firebase**: job files at `wirer/jobs/{id}.json`, an index at `wirer/jobs/index.json`, payload `{ schemaVersion: 1, job }`.
- **IndexedDB**: db `wirer-v1`, store `jobs` (keyPath `id`).
- **File I/O**: `exportJob` → `.wirer` JSON Blob; `importJob` validates schema then normalizes.
- **Schema version**: `SCHEMA_VERSION = 1`.

### Store (Zustand) — `job-store.ts`
State: `jobs` (summaries), `activeJob`, `historyTick`.
Actions: `loadLibrary`, `createJob`, `openJob`, `deleteJob(s)`, `renameJob`, `updateDiagram(updater, { history? })`, `commitDiagramHistory`, `undoDiagram`, `redoDiagram`, `canUndo/canRedo`, `exportActive`, `exportJobs`, `importFile`. A derived `useResolvedWireMap()` hook runs `resolveDirections` for the canvas.
`updateDiagram` records history (unless `history:false`), bumps `updatedAt`, and **debounces persistence by 300ms**.

### Undo/redo — `diagram-history.ts`
Per-job `{ past, future }` stacks (module-level map). `MAX_HISTORY = 100`; rapid edits within `COALESCE_MS = 400` coalesce. Transient drags capture a base snapshot on first `history:false` call and push it on `commitDiagramHistory()`. History resets on open/create/import.

---

## 11. Rebuild checklist (suggested order)

1. **Types** — port `src/domain/types.ts` exactly (§4). This is the contract everything depends on.
2. **Grid + anchors + orthogonal paths** — `grid.ts`, `anchors.ts`, `orthogonal-path.ts`, `path-editing.ts`.
3. **Defaults** — `createEmptyJob` (one breaker box).
4. **Geometry** — cable slots/exposed/stub, conduit run, wire/link/hub/device path builders + their `refresh*`/`resolve*` functions.
5. **Simulation** — `continuity.ts` (union-find + device slot rules) then `direction.ts` (seed + flip-aware BFS). Keep links and conduit runs both `flip:true`.
6. **Mutations** — box/wire/link/hub/cable/conduit-run/device/room create-update-delete. Each takes and returns a `Diagram`.
7. **Normalization/migration** — `normalizeJob` pipeline (§9).
8. **Persistence** — backend interface + memory backend first (for tests), then IndexedDB, then Firebase; file I/O.
9. **Store** — Zustand store + history.
10. **Rendering** — `CanvasViewport` (pan/zoom/marquee) + `DiagramSvg` layer stack (§7) + each shape/connection component + `WireChevronPath`.
11. **Editor** — tools, shortcuts, selection, marquee, move/resize, joint editing, Inspector, Issues, dialogs.
12. **Screens** — HomeScreen library + EditorScreen workspace.

### Test the invariants
- Continuity: a light is lit only when both terminals reach hot/neutral through closed switches; series dimmers take the min level.
- Direction: tracing one conductor through any mix of links and conduit runs yields a single continuous arrow direction; white-to-white splices never warn; genuine head-on splices do.
- Geometry: dragging a junction box updates attached cable/stub/wire/link paths live.
- History: one pointer-drag = one undo step.

---

*Keep this document and `docs/glossary.md` in sync with `src/domain/types.ts` when the model changes.*

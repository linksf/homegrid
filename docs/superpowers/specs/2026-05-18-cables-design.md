# Cables & Conduit Runs — Design Spec

**Date:** 2026-05-18  
**Status:** Approved  
**Replaces:** Junction-box `local` and `span` conduits for normal boxes

## Purpose

Junction boxes currently allow multiple wires to share a single anchor, causing overlapping selection and awkward editing. This spec introduces **cables** (1–3 wires at a junction anchor with a shared footprint) and **conduit runs** (cream sheathed runs between cables or to a breaker), with a clear split between **exposed** wiring inside boxes and **conduit** wiring in walls.

## Decisions (brainstorming)

| Topic | Decision |
|-------|----------|
| Architecture | **Approach 1:** new `Cable` + `ConduitRun` top-level types |
| Wire links | Only on the **exposed** side (in-box splices, hubs, devices) |
| Conduit → junction node | **Auto-create** matching cable at destination |
| Anchors | **One cable per anchor**, movable to any **free** anchor on the same box |
| Hub / device terminals | **Single connection** (one wire or one hub tie) — not cable sites |
| Grid layout | Wires on **adjacent grid points along the wall** (1/2/3 grid units wide) |
| Unconnected conduit | Short open stub until connected via connect tool |

## Domain model

### Cable

Replaces `local` conduit at a junction anchor.

```ts
interface Cable {
  id: string;
  junctionBoxId: string;
  anchor: AnchorPosition;
  wireIds: string[]; // length 1 | 2 | 3
  label?: string;
}
```

- Exactly one cable per `(junctionBoxId, anchor)` pair.
- Movable to another free anchor on the same junction box.
- Editable wire count (1–3) and colors (`red` | `black` | `white`).

### ConduitRun

Replaces `span` conduit between junction boxes (and breaker feeds).

```ts
interface ConduitRun {
  id: string;
  cableIdA: string;
  cableIdB: string | null;   // null = open stub / partial
  breakerId: string | null;  // mutually exclusive with cableIdB when set
  wireIds: string[];         // same multiset of colors as connected cables
}
```

- Connecting two cables requires **matching wire count and color multiset**.
- Like-colored wires are **electrically connected** through the run (no wire links on conduit side).
- Connecting to a breaker: no exposed side at panel; **direction seeds** apply.

### Wire (changes)

```ts
interface Wire {
  id: string;
  color: WireColor;
  label: string;
  cableId: string | null;      // replaces conduitId for junction-box cables
  conduitId: string | null;    // retained for hub | device | breaker stubs only
  breakerId: string | null;
  hubId: string | null;
  deviceNodeId: string | null;
  manualDirection: WireDirection | null;
}
```

### Diagram (changes)

```ts
interface Diagram {
  // ...
  cables: Cable[];
  conduitRuns: ConduitRun[];
  // conduits: no more local | span on normal boxes (migrated away)
}
```

### LayoutState (changes)

```ts
interface LayoutState {
  // ...
  exposedPaths?: Record<string, { points: Point[] }>;       // per wire, into box
  conduitStubPaths?: Record<string, { points: Point[] }>;   // per cable, out of box
  conduitRunPaths: Record<string, { points: Point[] }>;    // cream run centerline
  // wirePaths for hub/device/breaker stubs unchanged
}
```

Remove reliance on `wireLinkPaths` for conduit-side connections (wire links remain exposed-only).

## Geometry

### Grid slots on wall

`GRID_SIZE = 12`. Cable width = `wireCount × GRID_SIZE` along the wall tangent at the anchor.

| Wires | Wall span |
|-------|-----------|
| 1 | 12px |
| 2 | 24px |
| 3 | 36px |

Anchor position (e.g. `middle-left`) is the **center** of the span. Wire *i* (0-based) pins to:

`slotIndex = centerIndex - floor((n-1)/2) + i`

Each slot is one grid intersection on the box edge.

### Exposed side

- Per wire: 4-anchor orthogonal stub **inward** from its wall slot (reuse local stub logic).
- **Start** fixed on wall slot; **end** free for wire links / hub / device.
- Path: `layout.exposedPaths[wireId]`.

### Conduit side

- Per cable: cream sheath stub **outward** from cable center (5 anchors when part of a run segment).
- Unconnected: short stub (`CONDUIT_STUB_LENGTH`, same order as current local outward stub).
- Connected: `ConduitRun` centerline from cable A stub tip to cable B stub tip (or breaker anchor).
- Paths: `layout.conduitStubPaths[cableId]`, `layout.conduitRunPaths[runId]`.

### Junction box move / resize

When a box moves or resizes:

1. Recompute wall slot world points for each cable.
2. Pin exposed path endpoints to slots.
3. Refresh conduit stub attachments and conduit run endpoints.
4. Preserve custom path shapes where `hasCustomPathShape` applies.

## Rendering

| Element | Appearance | Layer |
|---------|------------|-------|
| ConduitRun | Cream wide stroke (~20px), rounded caps | Under junction boxes |
| Conduit stub | Same cream styling, per cable | Under or with runs |
| Exposed wires | Individual colored strokes + chevrons | Over junction boxes |
| Cable selection | Wall span highlight + stub + exposed group | — |

### Selection

| Click | Selects |
|-------|---------|
| Cream run / stub | `ConduitRun` or cable conduit side |
| Colored wire in box | Individual `Wire` |
| Cable wall footprint | Whole `Cable` |

Inspector for cable: label, wire count, colors, move anchor (dropdown of free anchors), delete.

## Connections

### Conduit connect tool (replaces span tool)

1. Pick source cable conduit stub (or run endpoint).
2. Pick destination: another cable stub, junction anchor (auto-create cable), or breaker anchor.
3. Validate wire count + color multiset match.
4. Create/update `ConduitRun`; auto-create destination `Cable` when connecting to bare anchor.
5. Merge wire continuity by color through the run.

### Exposed connections (unchanged semantics)

- **Wire link (J):** only between free **exposed** tips.
- **Hub / device (connect tool):** one wire or one hub tie per terminal.
- Remove multi-wire `device` conduits over time; single wire attachment only.

### Continuity

Union-find adds edges for:

- Wires in same `ConduitRun` with matching colors (implicit splice).
- Existing hub, hub bridge, wire link, device rules on exposed side.

### Direction

- `ConduitRun`: propagate **without** inversion (continuous buried run).
- Wire links on exposed side: **invert** (as today).
- Breaker termination: seed by color rules (as breaker conduits today).

## Editor tools

| Old | New |
|-----|-----|
| Local conduit (C) | **Cable (C)** — anchor → 1/2/3 wires + colors |
| Span conduit (E) | **Conduit connect (E)** — cable/run → cable/breaker/anchor |
| Wire link (J) | Same; restricted to exposed tips |

Toolbar, shortcuts, Inspector, and ConduitDialog become CableDialog for placement.

## Migration (on normalize)

1. Each `local` conduit → `Cable` + `exposedPaths` / `conduitStubPaths`.
2. Each `span` conduit → two `Cable`s (if missing at anchors) + one `ConduitRun`.
3. Multiple `local` on same anchor → merge into one cable if colors allow; else flag in issues panel.
4. `Wire.conduitId` on migrated wires → `cableId` when applicable.
5. Drop empty `local`/`span` conduits from persisted diagrams after migration.

## Phased delivery

| Phase | Scope |
|-------|-------|
| 1 | Types, cable geometry, exposed paths, basic render |
| 2 | Cable placement, selection, move anchor, edit wires |
| 3 | ConduitRun connect, auto-create destination cable, cream render |
| 4 | Breaker connect + direction through runs |
| 5 | Migration + remove local/span tools |
| 6 | Hub/device single-connection simplification |

## Out of scope (v1)

- Cables on hub splice points (hubs remain single-connection terminals).
- Partial conduit runs (tee splices mid-run).
- More than 3 wires per cable.

## Success criteria

- No two cables share an anchor; each wire has its own grid slot on the wall.
- Selecting a cable does not require picking stacked wire anchors.
- Conduit runs render as cream sheathed paths with editable anchors.
- Matching conduit connect auto-splices like colors; destination cable auto-created at junction anchor.
- Wire links work only on exposed tips; direction and continuity tests pass.

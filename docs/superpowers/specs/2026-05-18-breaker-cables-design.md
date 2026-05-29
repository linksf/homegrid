# Breaker Cables — Design Spec

**Date:** 2026-05-18  
**Status:** Approved  
**Builds on:** `docs/superpowers/specs/2026-05-18-cables-design.md`

## Purpose

Replace `BreakerConduit` (panel stub wires pointing into the breaker) with **breaker-type cables**: the same cable model used at junction boxes, but on breaker panel anchors the inward side shows a **toggle switch** instead of exposed wires. The outward side keeps normal conduit stub/run behavior.

## Decisions (brainstorming)

| Topic | Decision |
|-------|----------|
| Toggle OFF | **Open circuit** — no continuity and no direction seeding through that cable |
| Toggle ON | Continuity through conduit run + direction seeds (black/red away, white toward) |
| Creation | **Remove K (Breaker) tool**; **C (Cable)** on panel anchor creates breaker cable; **E (Conduit connect)** auto-creates breaker cable at empty panel anchor |
| Toggle UX | **Double-click** toggle on canvas + **On/Off** in Inspector when selected |
| Architecture | **Approach 1:** `Cable.role` flag; drop `BreakerConduit` and `ConduitRun.breakerId` |

## Domain model

### Cable (changes)

```ts
interface Cable {
  id: string;
  junctionBoxId: string;
  anchor: AnchorPosition;
  wireIds: string[]; // length 1 | 2 | 3
  label?: string;
  role?: 'junction' | 'breaker'; // default 'junction'
  closed?: boolean;              // breaker only; default true (ON)
}
```

- **`junction`** (default): normal box cable — exposed wires inward, cream conduit outward.
- **`breaker`**: only on `junctionBox.type === 'breaker'` anchors — **no exposed wires** inward; **`closed`** controls the circuit.
- Wires still exist (1–3) for conduit-run color pairing; **not linkable** on the panel side.

### ConduitRun (changes)

```ts
interface ConduitRun {
  id: string;
  cableIdA: string;
  cableIdB: string | null; // null = open stub
  wireIds: string[];
  // breakerId removed — panel termination is always cableIdB (or A)
}
```

Panel feeds are always cable-to-cable runs: field cable ↔ breaker cable.

### Removed

- `BreakerConduit` type and all `kind: 'breaker'` conduits
- `ConduitRun.breakerId`
- `addBreakerConduit`, `addBreaker` (panel circuit placement)
- **`conduit-breaker`** editor tool (K)
- `BreakerCircuitPreset` may remain for the cable placement dialog presets on panel anchors

### Wire (unchanged)

Wires on breaker cables use `cableId` (not `conduitId`). No `exposedPaths` entries.

## Geometry & rendering

| Side | Junction cable | Breaker cable |
|------|----------------|---------------|
| Outward (field) | Conduit stub / run | Same |
| Inward (panel) | Exposed colored wires | **Toggle switch** at anchor, inset into panel interior |

- Toggle positioned at wall anchor center, offset along **inward normal** (reuse `junctionBoxAnchorInwardNormal`).
- Visual: compact breaker/toggle glyph (lever or ON/OFF label), styled like switch state indicators.
- **`closed: true`** — “ON” appearance; **`closed: false`** — “OFF” / open appearance.
- Breaker cables still render wall footprint and conduit stub/run for selection.
- No chevrons on panel side (no exposed wire geometry).

## Editor tools

| Tool | Behavior |
|------|----------|
| **C (Cable)** on normal box | Creates `role: 'junction'` cable (unchanged) |
| **C (Cable)** on breaker panel | Creates `role: 'breaker'` cable via dialog (1–3 wires, preset colors) |
| **E (Conduit connect)** to empty panel anchor | Auto-creates matching `breaker` cable, then connects run |
| **E** to occupied panel anchor | Connects to existing breaker cable (wire multiset must match) |
| **J (Link wires)** | Unchanged on field exposed tips; breaker cable wires not linkable |
| **K (Breaker)** | **Removed** from toolbar, shortcuts, helper text |

### Toggle interaction

- **Double-click** toggle while **Select (V)** tool active → flip `closed`.
- **Inspector** when breaker cable selected: On/Off control + label + wire count/colors (read-only or editable per existing cable rules).

## Electrical behavior

### When `closed: true` (ON)

- Conduit-run wires pair through the breaker cable by color (same as today’s breaker conduit pairing).
- Direction seeds from panel: black/red **away**, white **toward**.
- Continuity graph includes run ↔ breaker cable conductors.

### When `closed: false` (OFF)

- **No continuity** between breaker cable conductors and their conduit-run partners (open SPST at panel).
- **No direction seeding** from panel for that cable’s wires.
- Field-side network among connected loads/switches remains valid but is not fed from the panel.

Implementation: in `continuity.ts` and `direction.ts`, gate breaker-cable adjacency and seeds on `isBreakerCable(c) && c.closed !== false`.

## Migration (on normalize)

1. Each `BreakerConduit` → `Cable` with `role: 'breaker'`, `closed: true`, same `junctionBoxId`, `anchor`, `wireIds`, `label`.
2. Rewire wires: `conduitId` → null, `cableId` → new cable id.
3. Each `ConduitRun` with `breakerId` → set `cableIdB` (or appropriate end) to migrated breaker cable id; remove `breakerId`.
4. Legacy `diagram.breakers[]` → breaker cables (extend `migrateLegacyBreakers`).
5. Delete `exposedPaths` for migrated breaker wires; remove breaker entries from `conduitPaths`.
6. Drop empty `kind: 'breaker'` conduits from persisted diagrams.

## Out of scope

- Per-conductor toggles (one toggle per circuit).
- Breaker cables on normal junction boxes.
- Panel bus bars or tie-breaker logic beyond color-matched runs.

## Success criteria

- **C** or **E** on a panel anchor produces a breaker-type cable: outward conduit, inward toggle, no exposed wires.
- Toggle OFF opens the circuit (continuity + direction); ON restores both.
- **K** tool removed; existing diagrams migrate without data loss.
- All domain tests pass; build succeeds.

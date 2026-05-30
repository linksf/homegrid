# Conduit Run Visibility & Group Coloring — Design

## Summary

Two view-only enhancements for cable conduit runs (the sheathed runs created with the
"Conduit connect" tool, plus each cable's stub into the wall):

1. **Hide conduits** — a toggle that hides all conduit runs and cable stubs, as if the
   conduit were buried inside the walls. Exposed cable wires at the junction box stay
   visible.
2. **Color-differentiate conduit groups** — a toggle that gives every conduit run its own
   distinct color and paints that color onto the run sheath *and* the two cables it
   connects (their stubs and exposed wires), making it easy to see which cables belong to
   which run.

Both are non-destructive view preferences. They do not modify the diagram model and are
persisted in `sessionStorage` like the existing "Show labels" toggle.

## Requirements (from brainstorming)

- **Hide scope:** hides the sheathed conduit — both the runs between cables and each
  cable's stub into the wall. Exposed wires at the junction box stay visible (they are real
  cable terminations, not "in the wall"). Exception: while the **Conduit connect** tool is
  active, stubs stay visible so the user can still pick them.
- **Controls:** two independent toolbar toggle buttons, styled like the existing
  "Labels (T)" button, each with a keyboard shortcut. They can both be on at once.
- **Color behavior:** when on, each conduit run gets a unique palette color applied to the
  run sheath and to both connected cables (their stubs *and* exposed wires), overriding the
  black/white/red conductor colors visually. Cables not part of any run keep their normal
  appearance.
- **Combination:** with conduits hidden but colors on, the grouped exposed wires still share
  a color, so the user can tell which cables are grouped even without seeing the conduit.

## Approach

Both features are pure view state owned by `EditorScreen`, threaded down through
`DiagramSvg` into `ConduitRunLayer` (runs + stubs) and `CableLayer` (exposed wires). No
domain types, mutations, or persistence schema change.

Group coloring is computed by a small pure helper from `diagram.conduitRuns`, producing
stable `runId → color` and `cableId → color` maps by cycling a fixed palette in run order.
Because conduit runs render in array order and the palette is deterministic, a given run
keeps its color across renders.

Rejected alternatives:

- **Storing visibility/color flags in the diagram model:** these are per-viewer display
  preferences, not document data; keeping them in `EditorScreen` view state (mirroring
  `showLabels`) is consistent and avoids schema churn.
- **Storing an explicit color on each `ConduitRun`:** unnecessary state to keep in sync on
  every add/remove; deterministic assignment from run order is simpler and self-healing.

## View State (`EditorScreen.tsx`)

Add two booleans alongside `showLabels`, each persisted in `sessionStorage`:

```ts
const HIDE_CONDUITS_KEY = 'wirer:hide-conduits';        // default false
const COLOR_CONDUIT_GROUPS_KEY = 'wirer:color-conduit-groups'; // default false
```

- `hideConduits` (default `false`) and `colorConduitGroups` (default `false`), each with a
  `read*Preference()` helper mirroring `readShowLabelsPreference`.
- Setters write through to `sessionStorage` (same pattern as `setShowLabels`).

## Group Color Helper

New module `src/canvas/conduit-group-colors.ts`:

- `CONDUIT_GROUP_PALETTE: readonly string[]` — ~10 visually distinct hex colors (avoiding
  pure black/white so they read clearly against the canvas and don't masquerade as
  conductor colors).
- `conduitGroupColors(diagram): { runColorById: Map<string,string>; cableColorById:
  Map<string,string> }`:
  - Iterates `diagram.conduitRuns` in order; assigns `PALETTE[i % PALETTE.length]` to each
    run id and to its `cableIdA` / `cableIdB`.
  - Cables not referenced by any run get no entry (callers fall back to default styling).

## Rendering

### `ConduitRunLayer`

New props: `hideConduits?: boolean`, `conduitConnectActive?: boolean`, and
`groupColorByRunId?: Map<string,string> | null`, `groupColorByCableId?: Map<string,string> |
null`.

- **Hide runs:** when `hideConduits`, skip rendering the run `<g>` elements entirely (both
  sheath visuals and run hit paths).
- **Hide stubs:** when `hideConduits`, skip the per-cable stub `<g>` elements — *unless*
  `conduitConnectActive` (stubs must stay pickable for the Conduit connect tool) or the stub
  hit target is otherwise needed (`stubHitActive`). Practically: render stubs when
  `!hideConduits || stubHitActive`.
- **Color runs:** when a `groupColorByRunId` entry exists for the run, set the sheath
  stroke to that color via inline `style`/`stroke` on `conduit-run__sheath` (leave the
  selected/outline styling intact). When no map is provided, render as today.
- **Color stubs:** likewise tint a cable stub's sheath when `groupColorByCableId` has the
  cable.

### `CableLayer`

New prop: `groupColorByCableId?: Map<string,string> | null`.

- When an entry exists for a cable, the exposed-wire `<path>` stroke for each of that
  cable's wires uses the group color instead of the `WIRE_CLASS[color]` stroke (apply via
  inline `stroke`, keep chevrons/hit paths unchanged). Otherwise unchanged.

### `DiagramSvg`

- Accept `hideConduits: boolean`, `colorConduitGroups: boolean`.
- Compute the color maps once (memoized) when `colorConduitGroups` is on, else pass `null`.
- Forward `hideConduits` and `conduitConnectActive={tool === 'conduit-connect'}` plus the
  color maps to `ConduitRunLayer`, and the cable color map to `CableLayer`.

## Toolbar (`Toolbar.tsx`)

Add two toggle buttons after the Labels button, following the same markup
(`toolbar-btn` + `--active`, `aria-pressed`, `title`, key hint span):

- **Hide conduits** — shortcut **W** ("walls"), new `IconConduitHidden` glyph.
- **Color groups** — shortcut **G** ("groups"), new `IconConduitColor` glyph.

New props: `hideConduits`, `onHideConduitsChange`, `colorConduitGroups`,
`onColorConduitGroupsChange`. Add the two icons to `ToolbarIcons`.

## Keyboard (`EditorScreen.tsx`)

In the single-character branch of the `keydown` handler (next to the `'t'` case, guarded by
`!mod && !e.altKey`):

- `w` ⇒ toggle `hideConduits` (write-through to `sessionStorage`).
- `g` ⇒ toggle `colorConduitGroups` (write-through to `sessionStorage`).

`w` and `g` are unused by tool shortcuts (`v,h,b,m,l,s,o,c,e,j`), labels (`t`), and rotate
(`r`), so there is no conflict. These are view toggles, not diagram mutations, so they are
intentionally not part of undo/redo.

## Testing

- `conduitGroupColors`: with N runs, each run id and its two cable ids map to
  `PALETTE[i % len]`; cables in no run have no entry; ordering is stable (same input ⇒ same
  output).
- Empty diagram / no runs ⇒ empty maps.
- (Light rendering smoke test if the suite has component coverage; otherwise rely on the
  pure-helper test plus manual verification.)

## Out of Scope

- Hiding or coloring device/hub wire conduits rendered by `ConduitLayer` (these are not the
  "cable conduit connections" in scope).
- Persisting color assignments in the document or letting the user pick per-run colors.
- Printing/export styling changes (export reads the same layers; behavior follows naturally
  but is not a target of this work).

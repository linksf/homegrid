# Conduit Run Visibility & Group Coloring — Implementation Plan

Design: `docs/superpowers/specs/2026-05-30-conduit-visibility-color-design.md`

Two view-only toggles for cable conduit runs: **Hide conduits** (W) and
**Color-differentiate conduit groups** (G). Pure view state in `EditorScreen`, no domain
model changes. TDD where there is testable logic (the color helper); rendering/wiring is
verified by build + lint + manual check.

## Task 1 — Group color helper (TDD)

**Files:** `src/canvas/conduit-group-colors.ts` (new),
`src/canvas/__tests__/conduit-group-colors.test.ts` (new).

1. Write failing tests for `conduitGroupColors(diagram)`:
   - With 0 runs ⇒ both maps empty.
   - With 3 runs ⇒ each run id maps to `PALETTE[i % len]`; each run's `cableIdA` and
     `cableIdB` map to the same color as the run.
   - More runs than palette length ⇒ colors cycle (`PALETTE[i % len]`).
   - A cable not referenced by any run has no entry in `cableColorById`.
   - Deterministic: same diagram ⇒ identical maps.
2. Implement:
   ```ts
   export const CONDUIT_GROUP_PALETTE: readonly string[] = [ /* ~10 distinct hexes */ ];
   export function conduitGroupColors(diagram: Diagram): {
     runColorById: Map<string, string>;
     cableColorById: Map<string, string>;
   }
   ```
   Iterate `diagram.conduitRuns` in order; assign `PALETTE[i % length]` to the run id and to
   `cableIdA`/`cableIdB` (skip null/undefined cable ids).
3. Run the new test file ⇒ green.

## Task 2 — View state in `EditorScreen`

**File:** `src/screens/EditorScreen.tsx`.

1. Add keys + readers (mirror `SHOW_LABELS_KEY` / `readShowLabelsPreference`, default
   `false`):
   - `HIDE_CONDUITS_KEY = 'wirer:hide-conduits'`, `readHideConduitsPreference()`.
   - `COLOR_CONDUIT_GROUPS_KEY = 'wirer:color-conduit-groups'`,
     `readColorConduitGroupsPreference()`.
2. Add state: `const [hideConduits, setHideConduits] = useState(readHideConduitsPreference);`
   and likewise `colorConduitGroups`.
3. Add small write-through setter helpers (or inline like `setShowLabels` does) that persist
   to `sessionStorage`.

## Task 3 — Keyboard shortcuts

**File:** `src/screens/EditorScreen.tsx` (the `keydown` handler, single-char branch next to
the `'t'` case).

- Add `w` ⇒ toggle `hideConduits` (persist), `g` ⇒ toggle `colorConduitGroups` (persist),
  both guarded by `!mod && !e.altKey`, with `e.preventDefault()` and `return`.
- These are view toggles → not routed through `updateDiagram` (not undoable).

## Task 4 — Toolbar buttons + icons

**Files:** `src/editor/ToolbarIcons.tsx`, `src/editor/Toolbar.tsx`.

1. Add `IconConduitHidden` (e.g. dashed/eye-off conduit) and `IconConduitColor` (e.g.
   overlapping colored strokes) using `IconBase`.
2. Extend `ToolbarProps` with `hideConduits`, `onHideConduitsChange`, `colorConduitGroups`,
   `onColorConduitGroupsChange`.
3. After the Labels button, add two toggle buttons mirroring its markup (`toolbar-btn` +
   `--active`, `aria-pressed`, `title`, `toolbar-btn__key` showing `W` / `G`).

## Task 5 — Plumb props through `EditorScreen` → `Toolbar` and `DiagramSvg`

**File:** `src/screens/EditorScreen.tsx`.

1. Pass the four new props to `<Toolbar>`.
2. Pass `hideConduits` and `colorConduitGroups` to `<DiagramSvg>`.

## Task 6 — `DiagramSvg` wiring

**File:** `src/canvas/DiagramSvg.tsx`.

1. Add props `hideConduits: boolean`, `colorConduitGroups: boolean`.
2. `const groups = useMemo(() => (colorConduitGroups ? conduitGroupColors(diagram) : null),
   [colorConduitGroups, diagram]);`
3. Pass to `<ConduitRunLayer>`: `hideConduits`,
   `conduitConnectActive={tool === 'conduit-connect'}`,
   `groupColorByRunId={groups?.runColorById ?? null}`,
   `groupColorByCableId={groups?.cableColorById ?? null}`.
4. Pass to `<CableLayer>`: `groupColorByCableId={groups?.cableColorById ?? null}`.

## Task 7 — `ConduitRunLayer` rendering

**File:** `src/canvas/ConduitRunLayer.tsx`.

1. Add props `hideConduits?: boolean`, `conduitConnectActive?: boolean`,
   `groupColorByRunId?: Map<string,string> | null`,
   `groupColorByCableId?: Map<string,string> | null`.
2. **Runs:** if `hideConduits`, skip the run `<g>` mapping entirely.
3. **Coloring runs:** when `groupColorByRunId?.get(run.id)` exists, set inline
   `style={{ stroke: color }}` on the `conduit-run__sheath` path (inline beats the CSS
   class). Keep the outline path as-is.
4. **Stubs:** render the stub block only when `!hideConduits || stubHitActive` (stubs stay
   pickable for Conduit connect / select-stub even when hidden). `conduitConnectActive` is
   subsumed by `stubHitActive` but kept as an explicit guard for clarity.
5. **Coloring stubs:** when `groupColorByCableId?.get(cable.id)` exists, tint that stub's
   `conduit-run__sheath` stroke inline.

## Task 8 — `CableLayer` exposed-wire coloring

**File:** `src/canvas/CableLayer.tsx`.

1. Add prop `groupColorByCableId?: Map<string,string> | null`.
2. For each cable, look up `groupColorByCableId?.get(cable.id)`. When present, render each
   wire path with inline `style={{ stroke: color }}` (overrides `WIRE_CLASS`). Leave
   chevrons and hit paths unchanged. When absent, behave exactly as today.

## Task 9 — Final verification

1. `npm run lint` and `npm run build` (or `tsc`) clean.
2. `npm test` ⇒ all green (existing + new helper tests).
3. Manual check via dev server:
   - Toggle **W**: conduit runs + stubs vanish; exposed wires remain; runs reappear when
     toggled off; stubs stay visible/pickable while Conduit connect tool is active.
   - Toggle **G**: each run + its two cables share a unique color; different runs differ;
     cables in no run keep normal colors.
   - Both on: runs hidden, grouped exposed wires still share colors.
   - Reload page ⇒ both toggles persist (sessionStorage).

## Notes / Decisions

- Export uses the same `DiagramSvg`; toggles will affect export output too. Acceptable and
  arguably desirable; not a separate target.
- Inline `style.stroke` is used for coloring because the sheath/wire colors come from CSS
  classes; inline styles win without needing `!important`.

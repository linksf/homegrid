# Device Rotation (90°) — Design

## Summary

Allow the user to rotate placed devices — light bulbs, switches, dimmer switches, and
outlets — in 90° increments. Rotation is a rigid transform: the device body, its text, and
its terminals all pivot together around the device's center. Junction boxes and breaker
panels are explicitly out of scope for this iteration.

## Requirements (from brainstorming)

- **Scope:** devices only — `LightBulb`, `Switch`, `DimmerSwitch`, `Outlet`. Junction
  boxes / breaker panels are deferred (their wall-anchored cables and fixed hub slots need
  separate anchor-remapping work).
- **Trigger:** both a keyboard shortcut and an Inspector button.
- **Visual behavior:** full rigid rotation — everything (including text labels) rotates.
- **Multi-select:** each selected device rotates 90° around its own center; objects do not
  move relative to one another.
- **Direction:** `R` rotates clockwise, `Shift+R` rotates counter-clockwise.

## Approach

Add an `orientation` field to each device and render it with an SVG `rotate(...)`
transform. Keep stored `x/y/width/height` unchanged; the box simply pivots around its
center. Make the single terminal-geometry function `deviceNodeWorldPoint` rotation-aware so
every downstream consumer (wires, conduits, hubs, hit layers, outward-normal math) becomes
correct from one change.

Rejected alternatives:

- **Swap width/height + remap slots per orientation:** far more invasive, and text would
  not rotate, conflicting with the chosen visual behavior.
- **Store rotation in `layout`:** terminal geometry is a domain concern consumed widely;
  putting it in the path-focused `layout` state is leaky and awkward.

## Data Model

In `src/domain/types.ts`, add to `LightBulb`, `Switch`, `DimmerSwitch`, and `Outlet`:

```ts
/** Clockwise rotation in degrees. One of 0 | 90 | 180 | 270. Defaults to 0. */
orientation?: 0 | 90 | 180 | 270;
```

The field is optional so existing saved diagrams load unchanged (absent ⇒ treated as 0).
`SCHEMA_VERSION` does not need to change because the field is additive and optional.

`normalize-devices.ts` coerces the value on load: missing or `0` ⇒ `0`; any value not in
`{0, 90, 180, 270}` is snapped to the nearest quarter-turn (defaulting to `0`).

## Geometry (core change)

In `src/domain/device-node-geometry.ts`:

- Introduce `deviceNodeLocalPoint(diagram, node)` returning the **unrotated** terminal
  point (the existing per-slot math, in world coords). This is what shape components use
  internally, since their group already applies the rotation transform.
- Add a helper `rotateAroundCenter(pt, center, deg)` that uses exact `sin`/`cos` values for
  quarter turns (`0`, `±1`) so there is no floating-point drift.
- `deviceNodeWorldPoint(diagram, node)` returns the local point rotated around the device's
  center by that device's `orientation`. This is the rotated, true world position used by
  all world-space consumers.
- `deviceNodeOutwardNormal` already derives its vector from `deviceNodeWorldPoint`, so it
  becomes correct automatically once the world point rotates.

Device centers:

- Light bulb: `lightBulbCenter(bulb)`.
- Switch / dimmer / outlet: `(x + width/2, y + height/2)`.

## Rendering

The four shape components — `SwitchShape`, `OutletShape`, `LightBulbShape`,
`DimmerSwitchShape` — render their children in local coordinates inside a
`transform={translate(x, y)}` group. For each:

- Append `rotate(orientation, centerX, centerY)` to the group transform so the body, text,
  terminal markers, and (for switches) the internal path lines all rotate rigidly.
- Replace internal terminal-position lookups that currently use `deviceNodeWorldPoint`
  (then subtract device `x/y`) with the new unrotated `deviceNodeLocalPoint`, to avoid
  applying rotation twice (once via the transform, once via the rotated world point).

World-space layers (e.g. `DeviceConnectionLayer`, `WireEndpointHitLayer`, wire/conduit
paths) keep using the now-rotated `deviceNodeWorldPoint` and need no per-file changes.

## Mutations

In `src/domain/device-mutations.ts`:

- `rotateDevice(diagram, kind, id, direction)` where `kind` is one of `'lightBulb' |
  'switch' | 'dimmerSwitch' | 'outlet'` and `direction` is `'cw' | 'ccw'`:
  - Sets `orientation = ((current ?? 0) + (direction === 'cw' ? 90 : -90) + 360) % 360`.
  - Refreshes attached paths exactly like the `move*` functions:
    `refreshHubWirePaths(rebuildDeviceConduitPathsForDevice(...))` plus
    `refreshDeviceWirePaths` so attached wires and conduit stubs follow the moved terminals.

In `src/editor/selection-actions.ts`:

- `rotateSelectedDevices(diagram, selection, direction)` iterates the selected
  `lightBulbs`, `switches`, `dimmerSwitches`, and `outlets`, calling `rotateDevice` for
  each so every device rotates around its own center.

## Triggers

### Keyboard (`EditorScreen.tsx`)

In the existing `keydown` handler, after the tool-shortcut block and only when
`tool === 'select'` and at least one device is selected:

- `r` (no modifier) ⇒ `updateDiagram(d => rotateSelectedDevices(d, selection, 'cw'))`.
- `Shift+R` ⇒ same with `'ccw'`.

`r` is currently unused by tool shortcuts, so there is no conflict. The action goes through
`updateDiagram`, making it undoable. Skip when focus is in an input/textarea/select (the
handler already guards this).

### Inspector (`Inspector.tsx`)

Add a "Rotate 90°" control — a counter-clockwise (⟲) and clockwise (⟳) button pair — to the
light, switch, dimmer, and outlet panels. Wire them through new optional callbacks
(`onRotateCcw` / `onRotateCw`, or a single `onRotate(direction)`) supplied by
`EditorScreen`, which call `rotateDevice` on the single selected device via `updateDiagram`.

## Testing

- `rotateDevice`: orientation cycles `0 → 90 → 180 → 270 → 0` for `'cw'` and the reverse
  for `'ccw'`, for each device kind.
- `deviceNodeWorldPoint`: terminal coordinates are correctly rotated at each orientation —
  e.g. a 2-terminal switch's left terminal becomes the top terminal after one clockwise
  turn, and returns to the left after four.
- `normalize-devices`: a device with missing or invalid `orientation` normalizes to `0`; a
  valid value is preserved.

## Out of Scope

- Junction boxes and breaker panels (wall anchors, hub-slot remapping).
- Rooms.
- Arbitrary (non-90°) rotation angles.
- Group rotation about a shared centroid (multi-select rotates each in place).

# Wiring Domain Glossary

This glossary defines terms as they are used in the codebase, primarily under `src/domain`.

## Core Model

- `Diagram`: The full wiring document, including boxes, wires, devices, connectivity, and layout geometry.
- `Job`: Top-level saved item that wraps a `diagram` plus metadata (`id`, `name`, timestamps, notes).
- `LayoutState`: Stored drawing geometry (paths and offsets) used for rendering and editing.

## Boxes, Anchors, and Bundles

- `JunctionBox`: A box on the diagram. Type is either `normal` or `breaker`.
- `AnchorPosition` (`anchor`): A fixed attach point on a junction box (for example `middle-left`, `top-right`).
- `Cable`: A bundle of 1-3 conductors attached to one box anchor, tracked by `wireIds`.
- `Cable.role`: `junction` (field cable) or `breaker` (panel-side cable).
- `Cable.closed`: Breaker-cable ON/OFF state. `false` means the breaker-side feed is open.
- `Conduit`: Legacy/aux bundle shape (`local`, `span`, `device`, `hub`).
- `ConduitRun`: A connection between two cable stubs (`cableIdA`/`cableIdB`) with paired conductors in `wireIds`.

## Conductors and Links

- `Wire`: A single conductor (`black`, `white`, `red`) with optional attachments (`cableId`, `conduitId`, `hubId`, `deviceNodeId`).
- `WireColor`: Conductor color enum: `black`, `white`, `red`.
- `WireDirection`: Direction label on a wire: `toward` or `away`.
- `manualDirection`: User-provided direction seed on a wire.
- `ResolvedWire`: Computed wire state with `resolvedDirection`, `directionSource`, and `directionConflict`.
- `WireEndpoint`: Wire path endpoint label: `start` or `end`.
- `WireLink`: Direct link between two wire endpoints (`wireIdA`/`endpointA` to `wireIdB`/`endpointB`).

## Devices and Terminals

- `DeviceNode`: A terminal on a device (`lightBulb`, `switch`, `dimmerSwitch`, `outlet`), identified by `slot`.
- `slot`: Terminal index within a device or hub (semantic meaning depends on device type).
- `LightBulb`: Two-terminal load.
- `Switch`: 2/3/4-terminal switch model with state (`open/closed`, traveler selection, or cross/straight).
- `DimmerSwitch`: Two-terminal dimmer with normalized level (0-100).
- `Outlet`: Duplex outlet model; can optionally be passthrough with four terminal slots.

## Splices and Interconnects

- `Hub`: Splice point inside a junction box where multiple wires can tie together.
- `HubSlot`: Fixed internal placement index for a hub (`0`-`3`).
- `HubBridge`: Connection between two hubs in different junction boxes.

## Electrical Semantics

- `Continuity`: Electrical connectedness in the network, computed with union-find over wire and terminal keys.
- `ContinuityKey`: Union-find node key type: `w:<wireId>` for wires and `t:<nodeId>` for terminals.
- `breaker` (legacy type): Older breaker object with black/white feed wire IDs.
- `switchConnectedSlots` / `dimmerConnectedSlots` / `outletConnectedSlots`: Internal terminal pairs that are electrically connected in current state.

## Layout Path Terms

- `wirePaths`: Per-wire editable path geometry for conduit wires.
- `wireLinkPaths`: Path geometry for wire-to-wire links.
- `conduitRunPaths`: Path geometry for sheath runs between cable stubs.
- `exposedPaths`: Visible cable-wire paths from wall slot inward.
- `conduitStubPaths`: Outward stub/sheath geometry from a cable anchor.
- `hubWirePaths`: Paths between hubs and attached wires/terminals.
- `deviceWirePaths`: Paths between device terminals and wire tips.
- `wireOffsets` / `conduitOffsets` / `wireLinkOffsets`: Stored nudges applied on top of routed geometry.

## Notes

- This glossary is intentionally code-first: terms mirror current TypeScript model names.
- If new domain types are introduced, update this file alongside `src/domain/types.ts`.

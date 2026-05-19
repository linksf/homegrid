import type { JSX } from 'react';
import { conduitCenterPath } from '../domain/layout-offsets';
import {
  conduitUsesPerWirePaths,
  draggableLinkVertexIndices,
  draggablePathVertexIndices,
  draggableWireVertexIndices,
} from '../domain/path-editing';
import { conduitEndpointRoles, moveConduitJoint } from '../domain/path-routing';
import { moveWireJoint } from '../domain/wire-routing';
import { moveWireLinkJoint, wireLinkDisplayPath, wireWorldPolyline } from '../domain/wire-geometry';
import type { Diagram } from '../domain/types';
import type { EditorMainTool } from '../editor/editor-tools';
import { PathJointHandles } from './PathJointHandles';

type PathEditLayerProps = {
  diagram: Diagram;
  tool: EditorMainTool;
  selectedWireId: string | null;
  selectedConduitId: string | null;
  selectedLinkId: string | null;
  onApplyDiagram?: (mutator: (diagram: Diagram) => Diagram) => void;
};

/** Joint handles rendered above wire/link hit targets so bends remain draggable. */
export function PathEditLayer({
  diagram,
  tool,
  selectedWireId,
  selectedConduitId,
  selectedLinkId,
  onApplyDiagram,
}: PathEditLayerProps): JSX.Element | null {
  if (tool !== 'select' || !onApplyDiagram) return null;

  const handles: JSX.Element[] = [];

  if (selectedWireId) {
    const wire = diagram.wires.find((w) => w.id === selectedWireId);
    const conduit = wire?.conduitId
      ? diagram.conduits.find((c) => c.id === wire.conduitId)
      : undefined;
    if (wire && conduit && conduitUsesPerWirePaths(conduit)) {
      const path = wireWorldPolyline(diagram, selectedWireId);
      const indices = path ? draggableWireVertexIndices(Boolean(wire.hubId)) : [];
      if (path && indices.length > 0) {
        handles.push(
          <PathJointHandles
            key={`wire-${selectedWireId}`}
            path={path}
            vertexIndices={indices}
            onMoveVertex={(index, x, y) => {
              onApplyDiagram((d) => moveWireJoint(d, selectedWireId, index, x, y));
            }}
          />,
        );
      }
    }
  } else if (selectedConduitId) {
    const conduit = diagram.conduits.find((c) => c.id === selectedConduitId);
    if (conduit && conduit.wireIds.length === 1) {
      const centerPath = conduitCenterPath(diagram, selectedConduitId);
      const roles = conduitEndpointRoles(diagram, conduit);
      const indices = centerPath ? draggablePathVertexIndices(centerPath.length, roles) : [];
      if (centerPath && indices.length > 0) {
        handles.push(
          <PathJointHandles
            key={`conduit-${selectedConduitId}`}
            path={centerPath}
            vertexIndices={indices}
            onMoveVertex={(index, x, y) => {
              if (conduitUsesPerWirePaths(conduit)) {
                onApplyDiagram((d) => moveWireJoint(d, conduit.wireIds[0]!, index, x, y));
              } else {
                onApplyDiagram((d) => moveConduitJoint(d, selectedConduitId, index, x, y));
              }
            }}
          />,
        );
      }
    }
  } else if (selectedLinkId) {
    const path = wireLinkDisplayPath(diagram, selectedLinkId);
    const indices = path ? draggableLinkVertexIndices() : [];
    if (path && indices.length > 0) {
      handles.push(
        <PathJointHandles
          key={`link-${selectedLinkId}`}
          path={path}
          vertexIndices={indices}
          onMoveVertex={(index, x, y) => {
            onApplyDiagram((d) => moveWireLinkJoint(d, selectedLinkId, index, x, y));
          }}
        />,
      );
    }
  }

  if (handles.length === 0) return null;

  return (
    <g className="path-edit-layer" role="presentation" aria-label="Path edit handles">
      {handles}
    </g>
  );
}

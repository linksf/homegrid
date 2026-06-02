import type { JSX } from 'react';
import { conduitCenterPath } from '../domain/layout-offsets';
import {
  conduitUsesPerWirePaths,
  draggableLinkVertexIndices,
  draggablePathVertexIndices,
  draggableWireVertexIndices,
} from '../domain/path-editing';
import { conduitEndpointRoles, moveConduitJoint } from '../domain/path-routing';
import { deviceWireDisplayPath, moveDeviceWireJoint } from '../domain/device-wire-geometry';
import { hubBridgeDisplayPath, moveHubBridgeJoint } from '../domain/hub-bridge-geometry';
import {
  conduitStubResolvedPath,
  moveConduitStubJoint,
  moveExposedJoint,
} from '../domain/cable-geometry';
import { moveConduitRunJoint, conduitRunDisplayPath, draggableConduitRunVertexIndices, refreshConduitRunPaths } from '../domain/conduit-run-geometry';
import { hubWireDisplayPath, moveHubWireJoint } from '../domain/hub-wire-geometry';
import { moveWireJoint, wireEndpointRoles } from '../domain/wire-routing';
import { moveWireLinkJoint, wireLinkDisplayPath, wireWorldPolyline } from '../domain/wire-geometry';
import type { Diagram } from '../domain/types';
import type { ApplyDiagramFn } from '../editor/apply-diagram';
import type { EditorMainTool } from '../editor/editor-tools';
import { PathJointHandles } from './PathJointHandles';

type PathEditLayerProps = {
  diagram: Diagram;
  tool: EditorMainTool;
  selectedWireId: string | null;
  selectedCableId: string | null;
  selectedConduitRunId: string | null;
  selectedHubWireId: string | null;
  selectedConduitId: string | null;
  selectedLinkId: string | null;
  selectedHubBridgeId: string | null;
  onApplyDiagram?: ApplyDiagramFn;
  onCommitHistory?: () => void;
};

/** Joint handles rendered above wire/link hit targets so bends remain draggable. */
export function PathEditLayer({
  diagram,
  tool,
  selectedWireId,
  selectedCableId,
  selectedConduitRunId,
  selectedHubWireId,
  selectedConduitId,
  selectedLinkId,
  selectedHubBridgeId,
  onApplyDiagram,
  onCommitHistory,
}: PathEditLayerProps): JSX.Element | null {
  if (tool !== 'select' || !onApplyDiagram) return null;

  const handles: JSX.Element[] = [];

  if (selectedHubWireId) {
    const hubPath = hubWireDisplayPath(diagram, selectedHubWireId);
    const hubIndices = draggableLinkVertexIndices(hubPath.length);
    if (hubPath.length >= 2 && hubIndices.length > 0) {
      handles.push(
        <PathJointHandles
          key={`hub-wire-${selectedHubWireId}`}
          path={hubPath}
          vertexIndices={hubIndices}
          onMoveVertex={(index, x, y) => {
            onApplyDiagram((d) => moveHubWireJoint(d, selectedHubWireId, index, x, y), { history: false });
          }}
          onCommitHistory={onCommitHistory}
        />,
      );
    }
  } else if (selectedConduitRunId) {
    const runPath = conduitRunDisplayPath(diagram, selectedConduitRunId);
    const runIndices = draggableConduitRunVertexIndices(runPath.length);
    if (runPath.length >= 2 && runIndices.length > 0) {
      handles.push(
        <PathJointHandles
          key={`conduit-run-${selectedConduitRunId}`}
          path={runPath}
          vertexIndices={runIndices}
          onMoveVertex={(index, x, y) => {
            onApplyDiagram((d) => moveConduitRunJoint(d, selectedConduitRunId, index, x, y), {
              history: false,
            });
          }}
          onCommitHistory={onCommitHistory}
        />,
      );
    }
  } else if (selectedWireId) {
    const wire = diagram.wires.find((w) => w.id === selectedWireId);
    const conduit = wire?.conduitId
      ? diagram.conduits.find((c) => c.id === wire.conduitId)
      : undefined;

    if (wire?.hubId) {
      const hubPath = hubWireDisplayPath(diagram, selectedWireId);
      const hubIndices = draggableLinkVertexIndices(hubPath.length);
      if (hubPath.length >= 2 && hubIndices.length > 0) {
        handles.push(
          <PathJointHandles
            key={`hub-wire-${selectedWireId}`}
            path={hubPath}
            vertexIndices={hubIndices}
            onMoveVertex={(index, x, y) => {
              onApplyDiagram((d) => moveHubWireJoint(d, selectedWireId, index, x, y), { history: false });
            }}
            onCommitHistory={onCommitHistory}
          />,
        );
      }
    }

    if (wire?.deviceNodeId) {
      const devicePath = deviceWireDisplayPath(diagram, selectedWireId);
      const deviceIndices = draggableLinkVertexIndices(devicePath.length);
      if (devicePath.length >= 2 && deviceIndices.length > 0) {
        handles.push(
          <PathJointHandles
            key={`device-wire-${selectedWireId}`}
            path={devicePath}
            vertexIndices={deviceIndices}
            onMoveVertex={(index, x, y) => {
              onApplyDiagram((d) => moveDeviceWireJoint(d, selectedWireId, index, x, y), { history: false });
            }}
            onCommitHistory={onCommitHistory}
          />,
        );
      }
    }

    if (wire?.cableId) {
      const path = wireWorldPolyline(diagram, selectedWireId);
      const indices = path ? draggableWireVertexIndices(path.length, true, false) : [];
      if (path && indices.length > 0) {
        handles.push(
          <PathJointHandles
            key={`exposed-${selectedWireId}`}
            path={path}
            vertexIndices={indices}
            onMoveVertex={(index, x, y) => {
              onApplyDiagram((d) => moveExposedJoint(d, selectedWireId, index, x, y), { history: false });
            }}
            onCommitHistory={onCommitHistory}
          />,
        );
      }
    }

    if (wire && conduit && conduitUsesPerWirePaths(conduit)) {
      const path = wireWorldPolyline(diagram, selectedWireId);
      const roles = wireEndpointRoles(diagram, selectedWireId);
      const indices = path
        ? draggableWireVertexIndices(path.length, roles.start === 'fixed', roles.end === 'fixed')
        : [];
      if (path && indices.length > 0) {
        handles.push(
          <PathJointHandles
            key={`wire-${selectedWireId}`}
            path={path}
            vertexIndices={indices}
            onMoveVertex={(index, x, y) => {
              onApplyDiagram((d) => moveWireJoint(d, selectedWireId, index, x, y), { history: false });
            }}
            onCommitHistory={onCommitHistory}
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
                onApplyDiagram((d) => moveWireJoint(d, conduit.wireIds[0]!, index, x, y), { history: false });
              } else {
                onApplyDiagram((d) => moveConduitJoint(d, selectedConduitId, index, x, y), { history: false });
              }
            }}
            onCommitHistory={onCommitHistory}
          />,
        );
      }
    }
  } else if (selectedCableId) {
    const path = conduitStubResolvedPath(diagram, selectedCableId);
    const indices = path ? draggableWireVertexIndices(path.length, true, false) : [];
    if (path && indices.length > 0) {
      handles.push(
        <PathJointHandles
          key={`cable-stub-${selectedCableId}`}
          path={path}
          vertexIndices={indices}
          onMoveVertex={(index, x, y) => {
            onApplyDiagram((d) => {
              let next = moveConduitStubJoint(d, selectedCableId, index, x, y);
              return refreshConduitRunPaths(next);
            }, {
              history: false,
            });
          }}
          onCommitHistory={onCommitHistory}
        />,
      );
    }
  } else if (selectedLinkId) {
    const path = wireLinkDisplayPath(diagram, selectedLinkId);
    const indices = path ? draggableLinkVertexIndices(path.length) : [];
    if (path && indices.length > 0) {
      handles.push(
        <PathJointHandles
          key={`link-${selectedLinkId}`}
          path={path}
          vertexIndices={indices}
          onMoveVertex={(index, x, y) => {
            onApplyDiagram((d) => moveWireLinkJoint(d, selectedLinkId, index, x, y), { history: false });
          }}
          onCommitHistory={onCommitHistory}
        />,
      );
    }
  } else if (selectedHubBridgeId) {
    const path = hubBridgeDisplayPath(diagram, selectedHubBridgeId);
    const indices = draggableLinkVertexIndices(path.length);
    if (path.length >= 2 && indices.length > 0) {
      handles.push(
        <PathJointHandles
          key={`hub-bridge-${selectedHubBridgeId}`}
          path={path}
          vertexIndices={indices}
          onMoveVertex={(index, x, y) => {
            onApplyDiagram((d) => moveHubBridgeJoint(d, selectedHubBridgeId, index, x, y), { history: false });
          }}
          onCommitHistory={onCommitHistory}
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

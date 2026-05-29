import type { EditorMainTool } from './editor-tools';

export type ToolShortcut = {
  tool: EditorMainTool;
  key: string;
  label: string;
};

export const TOOL_SHORTCUTS: ToolShortcut[] = [
  { tool: 'select', key: 'v', label: 'Select' },
  { tool: 'pan', key: 'h', label: 'Pan' },
  { tool: 'place-junction', key: 'b', label: 'Box' },
  { tool: 'place-room', key: 'm', label: 'Room' },
  { tool: 'place-light-bulb', key: 'l', label: 'Light' },
  { tool: 'place-switch', key: 's', label: 'Switch' },
  { tool: 'place-outlet', key: 'o', label: 'Outlet' },
  { tool: 'cable', key: 'c', label: 'Cable' },
  { tool: 'conduit-connect', key: 'e', label: 'Conduit connect' },
  { tool: 'connect-wires', key: 'j', label: 'Link wires' },
];

const toolByKey = new Map(TOOL_SHORTCUTS.map((entry) => [entry.key, entry.tool]));

export function toolForShortcutKey(key: string): EditorMainTool | null {
  return toolByKey.get(key.toLowerCase()) ?? null;
}

export function shortcutForTool(tool: EditorMainTool): ToolShortcut | undefined {
  return TOOL_SHORTCUTS.find((entry) => entry.tool === tool);
}

export function shortcutKeyLabel(key: string): string {
  return key.toUpperCase();
}

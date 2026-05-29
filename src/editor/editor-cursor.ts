import type { EditorMainTool } from './editor-tools';

/** Tool whose cursor is shown on the canvas (Shift-pan temporarily uses pan). */
export function viewportCursorTool(tool: EditorMainTool, panActive: boolean): EditorMainTool {
  return panActive ? 'pan' : tool;
}

export function viewportCursorClass(tool: EditorMainTool, panActive: boolean): string {
  return `canvas-viewport--tool-${viewportCursorTool(tool, panActive)}`;
}

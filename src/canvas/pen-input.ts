/** Pointer Events button flag for the pen barrel / secondary button. */
export const PEN_BARREL_BUTTON_FLAG = 2;

/** Pointer Events button flag for the pen tip (primary). */
export const PEN_TIP_BUTTON_FLAG = 1;

/** Two barrel presses within this window count as a double-tap. */
export const PEN_DOUBLE_BARREL_MS = 400;

/** Hold barrel this long before squeeze-pan activates (avoids conflicting with double-tap). */
export const PEN_SQUEEZE_HOLD_MS = 150;

export function isPenPointer(pointerType: string): boolean {
  return pointerType === 'pen';
}

/** Pen is hovering above the display (tip not down). */
export function isPenHoverEvent(event: Pick<PointerEvent, 'pointerType' | 'buttons'>): boolean {
  return isPenPointer(event.pointerType) && event.buttons === 0;
}

/** Barrel pressed without the tip down (Pencil Pro squeeze / barrel double-tap in Safari). */
export function isPenBarrelPressEvent(
  event: Pick<PointerEvent, 'pointerType' | 'buttons' | 'button' | 'pressure'>,
): boolean {
  if (!isPenPointer(event.pointerType)) return false;
  const barrelDown = (event.buttons & PEN_BARREL_BUTTON_FLAG) !== 0;
  const tipDown = (event.buttons & PEN_TIP_BUTTON_FLAG) !== 0;
  if (event.button === PEN_BARREL_BUTTON_FLAG) return true;
  if (barrelDown && !tipDown) return true;
  if (barrelDown && event.pressure === 0) return true;
  return false;
}

export function isPenTipDownEvent(event: Pick<PointerEvent, 'pointerType' | 'buttons'>): boolean {
  return isPenPointer(event.pointerType) && (event.buttons & PEN_TIP_BUTTON_FLAG) !== 0;
}

/** Tap gestures apply to finger on touch-first devices and to pen everywhere. */
export function supportsTapGesturePointer(pointerType: string, touchNavigation: boolean): boolean {
  if (pointerType === 'touch') return touchNavigation;
  return isPenPointer(pointerType);
}

/** Empty-canvas pan with a finger on touch-first tablets; pen selects instead. */
export function sheetPanAllowedForPointer(
  pointerType: string,
  touchNavigation: boolean,
  panToolActive: boolean,
): boolean {
  if (panToolActive) return true;
  if (!touchNavigation) return true;
  return pointerType === 'touch';
}

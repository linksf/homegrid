import { createContext, useContext, type JSX, type ReactNode } from 'react';

export const DEFAULT_LABEL_SCREEN_PX = 60;
export const MIN_LABEL_SCREEN_PX = 32;
export const MAX_LABEL_SCREEN_PX = 112;

const LabelSizeContext = createContext(DEFAULT_LABEL_SCREEN_PX);

export function LabelSizeProvider({
  labelScreenPx,
  children,
}: {
  labelScreenPx: number;
  children: ReactNode;
}): JSX.Element {
  return <LabelSizeContext.Provider value={labelScreenPx}>{children}</LabelSizeContext.Provider>;
}

export function useLabelScreenPx(): number {
  return useContext(LabelSizeContext);
}

export interface LayoutRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PositionedElement {
  getBoundingClientRect(): LayoutRect;
}

export function findOverlappingBlocker<T extends PositionedElement>(toast: LayoutRect, blockers: readonly T[]): T | undefined {
  return blockers.find(blocker => {
    const rect = blocker.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0
      && toast.left < rect.right && toast.right > rect.left
      && toast.top < rect.bottom && toast.bottom > rect.top;
  });
}

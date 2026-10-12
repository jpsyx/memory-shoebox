/** Shared timing for paper settling onto the enamel panel. */
export const PAPER_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Read the current preference at the action, including changes mid-session. */
export function hasReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Visible geometry, with page scroll separated from an element's rotation. */
export type PaperGeometry = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  angle: number;
};

/** Read the flat paper dimensions rather than its rotated bounding rectangle. */
export function getPaperGeometryFromElement(
  element: HTMLElement,
): PaperGeometry {
  const bounds = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const transform = style.transform;
  const scale = Number.parseFloat(style.scale) || 1;
  const angle = Number.parseFloat(style.rotate) || 0;
  const matrix =
    typeof DOMMatrixReadOnly === "undefined"
      ? undefined
      : new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
  return {
    centerX: bounds.left + bounds.width / 2,
    centerY: bounds.top + bounds.height / 2,
    width:
      (element.offsetWidth || bounds.width) *
      scale *
      (matrix ? Math.hypot(matrix.a, matrix.b) : 1),
    height:
      (element.offsetHeight || bounds.height) *
      scale *
      (matrix ? Math.hypot(matrix.c, matrix.d) : 1),
    angle:
      angle + (matrix ? (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI : 0),
  };
}

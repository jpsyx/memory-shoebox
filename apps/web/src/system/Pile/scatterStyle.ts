import type { CSSProperties } from "react";

/**
 * A cheap deterministic hash. Enough scatter to look unsorted, stable across
 * reloads so the wall does not jitter every time somebody visits.
 */
function _seededUnit(index: number): number {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * The tilt, offset and stacking order of one print, seeded from its position
 * in the pile. Computed rather than authored, which is why it is an inline
 * style: there is one value per print and it is derived, not chosen.
 */
export function scatterStyle(seed: number): CSSProperties {
  const rotation = _seededUnit(seed);
  const across = _seededUnit(seed + 101);
  const down = _seededUnit(seed + 211);
  return {
    "--r": `${(rotation * 5 - 2.5).toFixed(2)}deg`,
    "--dx": `${(across * 10 - 5).toFixed(1)}px`,
    "--dy": `${(down * 10 - 5).toFixed(1)}px`,
    "--z": String(1 + Math.floor(rotation * 6)),
  } as CSSProperties;
}

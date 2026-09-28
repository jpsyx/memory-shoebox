/**
 * Icons.
 *
 * Inline SVG on a 24px viewBox at 1.5rem, 1.75 stroke, round caps and joins,
 * `fill: none`, `stroke: currentColor`. Tabler's outline set is drawn to
 * exactly that specification, so the shared props below are the whole
 * adaptation. Never a glyph font, never an `<img>`.
 */

import type { ReactNode } from "react";

/** Spread onto any Tabler outline icon to put it in this world. */
export const ICON_PROPS = { size: "1.5rem", stroke: 1.75 } as const;

/** The same icon at the size small chips and stamps use. */
export const ICON_PROPS_SMALL = { size: "1.15rem", stroke: 1.75 } as const;

type Props = {
  readonly paused?: boolean;
};

/**
 * Play and pause are the two solid shapes in the system. A transport control
 * is read at a glance from across a room, and an outline triangle is not.
 */
export function PlayGlyph({ paused = true }: Props): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={
          paused ? "M8 5.5v13l11-6.5z" : "M9 5.5h2.5v13H9zM14.5 5.5H17v13h-2.5z"
        }
      />
    </svg>
  );
}

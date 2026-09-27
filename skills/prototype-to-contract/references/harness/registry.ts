import type { ReactNode } from "react";

/**
 * One state of one surface.
 *
 * The spec names the states each surface has to solve, not just its happy
 * path, because the states are where these go wrong. Each one is a separate
 * entry here so it can be looked at on its own and argued with.
 */
export interface SurfaceState {
  readonly id: string;
  readonly label: string;
  /** What this state is showing, in one line, for the harness rail. */
  readonly note: string;
  readonly render: () => ReactNode;
}

export interface Surface {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  /** Who reaches it: anyone, every member, an uploader, an admin. */
  readonly who: string;
  readonly group: "member" | "admin";
  readonly blurb: string;
  readonly states: readonly SurfaceState[];
}

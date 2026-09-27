import { Page } from "@/system/Chrome";
import { Lede, Prose } from "@/system/typography";
import { surfaceById } from "@/surfaces";
import type { SurfaceState } from "@/surfaces/registry";
import type { ReactNode } from "react";

/**
 * One surface in one of its states. The surface renders exactly as it would
 * in the product: the harness contributes nothing but the rail at the foot of
 * the window.
 */
export function SurfacePage({
  surfaceId,
  stateId,
}: {
  readonly surfaceId: string;
  readonly stateId?: string;
}): ReactNode {
  const surface = surfaceById(surfaceId);

  if (!surface) {
    return (
      <Page>
        <Lede>No surface by that name.</Lede>
        <Prose onPanel>
          The rail at the foot of the window lists every surface that exists.
        </Prose>
      </Page>
    );
  }

  const state: SurfaceState | undefined =
    surface.states.find((candidate) => {
      return candidate.id === stateId;
    }) ?? surface.states[0];

  if (!state) {
    return (
      <Page>
        <Lede>{surface.title} has no states yet.</Lede>
      </Page>
    );
  }

  return <>{state.render()}</>;
}

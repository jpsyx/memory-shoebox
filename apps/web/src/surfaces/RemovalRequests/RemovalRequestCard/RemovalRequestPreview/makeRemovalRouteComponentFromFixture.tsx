import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { DeclineRemovalControls } from "../../RemovalActionDialogs/DeclineRemovalDialog/DeclineRemovalControls";
import type { RemovalActions } from "../../useRemovalActions/useRemovalActions";
import { RemovalRequestPreview } from "./RemovalRequestPreview";

type Fixture = {
  kind: string;
  request: RemovalRequestDto;
  actions: RemovalActions;
  href: string;
};

/**
 * Captures one route fixture while keeping its component stable through
 * navigation.
 */
export function makeRemovalRouteComponentFromFixture({
  kind,
  request,
  actions,
  href,
}: Readonly<Fixture>): () => ReactNode {
  return function RemovalRouteFixture(): ReactNode {
    return kind === "preview" ? (
      <RemovalRequestPreview request={request} />
    ) : (
      <DeclineRemovalControls actions={actions} reason="" href={href} />
    );
  };
}

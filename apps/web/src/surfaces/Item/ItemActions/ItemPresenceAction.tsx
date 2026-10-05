import { Button } from "@mantine/core";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { meQueryOptions } from "@/api/me/me";

/** Only current admins may enter the item-opening observation surface. */
export function ItemPresenceAction({
  itemId,
}: Readonly<{ itemId: string }>): ReactNode {
  const { viewer } = useRouteContext({ from: "/_app" });
  const account = useQuery({ ...meQueryOptions, enabled: false });
  return viewer.isAdmin && account.data?.me.role === "admin" ? (
    <Link to="/presence" search={{ itemId }}>
      <Button component="span" variant="default">
        Who opened this
      </Button>
    </Link>
  ) : null;
}

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

type Props = { itemId: string };

/** Identifies an uncached item without inventing its preview or opening it. */
export function ViewerItemReference({ itemId }: Readonly<Props>): ReactNode {
  return (
    <div>
      <Link to="/items/$itemId" params={{ itemId }}>
        Open this item
      </Link>
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";

type Props = { itemId: string };

/** Identifies an uncached item without inventing its preview or opening it. */
export function ViewerItemReference({ itemId }: Readonly<Props>): ReactNode {
  return (
    <div>
      <Prose>
        No preview is loaded for this visit. You can read the opening records
        below or open the item.
      </Prose>
      <Link to="/items/$itemId" params={{ itemId }}>
        Open this item
      </Link>
    </div>
  );
}

import { Button } from "@mantine/core";
import { IconFlag } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { ItemDetail } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { ICON_PROPS } from "@/system/icons";
import { Prose } from "@/system/typography/Prose";
import { removalAskProse } from "@/surfaces/Item/itemCopy/itemCopy";

type Props = {
  detail: ItemDetail;
};

/**
 * The one thing a viewer can do about somebody else's photograph they are in:
 * ask for it to come down. A link to surface 10, which step 8b builds; the
 * caller draws this only when `capabilities.canRequestRemoval` says so.
 */
export function RemovalAsk({ detail }: Readonly<Props>): ReactNode {
  return (
    <>
      <ChipRow>
        <Button
          variant="default"
          leftSection={<IconFlag {...ICON_PROPS} />}
          renderRoot={(props) => {
            return (
              <Link
                {...props}
                to="/items/$itemId/removal"
                params={{ itemId: detail.itemId }}
              />
            );
          }}
        >
          Ask for this to come down
        </Button>
      </ChipRow>
      <Prose>{removalAskProse(detail.uploadedBy.displayName)}</Prose>
    </>
  );
}

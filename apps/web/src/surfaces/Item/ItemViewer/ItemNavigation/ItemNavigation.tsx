import { Group, Tooltip } from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { ItemDetail } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { FocusKeepingButton } from "@/system/FocusKeepingButton/FocusKeepingButton";
import { ICON_PROPS } from "@/system/icons";
import { useItemNavigation } from "./useItemNavigation";
import { useItemNavigationKeys } from "./useItemNavigationKeys";
import classes from "./ItemNavigation.module.css";

type Props = { detail: ItemDetail; isPlaceholder: boolean; memberId: string };

/** Full-size previous/next targets shared by the photo and video viewer. */
export function ItemNavigation({
  detail,
  isPlaceholder,
  memberId,
}: Readonly<Props>): ReactNode {
  const navigation = useItemNavigation({ detail, isPlaceholder, memberId });
  useItemNavigationKeys(navigation.move);
  return (
    <nav aria-label="Photo and video navigation">
      <Group gap={0} wrap="nowrap">
        <Tooltip label="Previous (← or h)">
          <FocusKeepingButton
            className={classes.navigationArrow}
            variant="subtle"
            aria-label="Previous photo or video"
            aria-keyshortcuts="ArrowLeft h"
            isUnavailable={!navigation.previous}
            onClick={() => {
              void navigation.move("previous");
            }}
          >
            <IconChevronLeft {...ICON_PROPS} />
          </FocusKeepingButton>
        </Tooltip>
        <Tooltip label="Next (→ or l)">
          <FocusKeepingButton
            className={classes.navigationArrow}
            variant="subtle"
            aria-label="Next photo or video"
            aria-keyshortcuts="ArrowRight l"
            isUnavailable={!navigation.next}
            onClick={() => {
              void navigation.move("next");
            }}
          >
            <IconChevronRight {...ICON_PROPS} />
          </FocusKeepingButton>
        </Tooltip>
      </Group>
      {navigation.error === undefined ? null : (
        <div className={classes.navigationError} role="status">
          {navigation.error}{" "}
          <button
            type="button"
            onClick={() => {
              void navigation.retry();
            }}
          >
            Retry navigation
          </button>
        </div>
      )}
    </nav>
  );
}

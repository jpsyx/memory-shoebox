import { ActionIcon, Menu } from "@mantine/core";
import { IconDots, IconPhotoMinus } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { BurstFrameRef } from "@memory-shoebox/shared";
import { Print } from "@/system/Pile/Print/Print";
import { ICON_PROPS } from "@/system/icons";
import classes from "./BurstPhoto.module.css";

type Props = {
  frame: BurstFrameRef;
  seed: number;
  onOpen?: (itemId: string) => void;
  onRemove?: (itemId: string) => void;
};

/**
 * A separate menu target keeps editing out of the photo's navigation button.
 */
function _renderMenu({
  frame,
  onRemove,
}: Readonly<{
  frame: BurstFrameRef;
  onRemove: (itemId: string) => void;
}>): ReactNode {
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <ActionIcon
          className={classes.burstPhotoOptions}
          variant="default"
          size={48}
          aria-label={`Photo ${frame.position} options`}
        >
          <span className={classes.burstPhotoOptionsFace}>
            <IconDots size={18} stroke={1.7} />
          </span>
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconPhotoMinus {...ICON_PROPS} />}
          onClick={() => {
            return onRemove(frame.itemId);
          }}
        >
          Make standalone
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/** A fanned photo keeps its open target separate from its membership menu. */
export function BurstPhoto({
  frame,
  seed,
  onOpen,
  onRemove,
}: Readonly<Props>): ReactNode {
  return (
    <Print
      media={frame}
      itemId={frame.itemId}
      seed={seed}
      onClick={() => {
        return onOpen?.(frame.itemId);
      }}
      overlays={
        frame.canRemoveFromBurst === true && onRemove !== undefined
          ? _renderMenu({ frame, onRemove })
          : undefined
      }
    />
  );
}

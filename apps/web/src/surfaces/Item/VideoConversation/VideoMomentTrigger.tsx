import { UnstyledButton } from "@mantine/core";
import { type ComponentPropsWithoutRef, type ReactNode, type Ref } from "react";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import {
  videoMomentLabel,
  type VideoMomentGroup,
} from "./videoMomentHelpers/videoMomentHelpers";
import classes from "./VideoConversation.module.css";

type Props = ComponentPropsWithoutRef<"button"> & {
  group: VideoMomentGroup;
  opened: boolean;
  ref?: Ref<HTMLButtonElement>;
};

/** A generous transparent hit area keeps the emoji or initial above its pin. */
export function VideoMomentTrigger({
  group,
  opened,
  ref,
  ...props
}: Readonly<Props>): ReactNode {
  const first = group.moments[0]!;
  const isGroup = group.moments.length > 1;
  return (
    <UnstyledButton
      {...props}
      ref={ref}
      type="button"
      className={classes.mark}
      style={{ left: `${group.leftPercent}%` }}
      data-opened={opened || undefined}
      aria-label={
        isGroup
          ? `${group.moments.length} moments near ${clockLabel(group.atSeconds)}`
          : videoMomentLabel(first)
      }
    >
      <span aria-hidden="true" className={classes.markContent}>
        <span
          className={
            first.reaction === undefined
              ? classes.avatarGlyph
              : classes.emojiGlyph
          }
        >
          {first.glyph}
        </span>
        {isGroup ? (
          <span className={classes.markCount}>+{group.moments.length - 1}</span>
        ) : null}
      </span>
    </UnstyledButton>
  );
}

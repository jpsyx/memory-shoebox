import { Button, Portal } from "@mantine/core";
import { IconSquareCheck } from "@tabler/icons-react";
import type { ReactNode, RefObject } from "react";
import { TIMELINE_SELECTION_ACTION_ID } from "@/system/ProductBar/ProductBar.constants";
import { ICON_PROPS } from "@/system/icons";

type Props = {
  buttonRef: RefObject<HTMLButtonElement | null>;
  onStart: () => void;
};

/** The timeline owns this action's lifetime, even though it renders in the header. */
export function TimelineSelectionHeaderButton(
  props: Readonly<Props>,
): ReactNode {
  return (
    <Portal target={`#${TIMELINE_SELECTION_ACTION_ID}`}>
      <Button
        ref={props.buttonRef}
        variant="panel"
        leftSection={<IconSquareCheck {...ICON_PROPS} />}
        onClick={props.onStart}
      >
        Select photos
      </Button>
    </Portal>
  );
}

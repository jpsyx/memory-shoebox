import { Button } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { FocusKeepingButton } from "@/system/FocusKeepingButton/FocusKeepingButton";
import { ICON_PROPS } from "@/system/icons";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";

type Props = {
  /** Where the words go, said beside Send while nothing is pinned. */
  goesTo: string;
  canSend: boolean;
  isSending: boolean;
  pinnedAt?: number;
  onUnpin: () => void;
};

/**
 * Under the composer's field: Send, and beside it either where the words go
 * or the moment they are pinned to, with Unpin.
 */
export function ComposerSendRow({
  goesTo,
  canSend,
  isSending,
  pinnedAt,
  onUnpin,
}: Readonly<Props>): ReactNode {
  return (
    <div className={classes.composerRow}>
      {/* Pressed, it is sending and then empty: it keeps focus through both
          until the composer hands it to the field. */}
      <FocusKeepingButton
        type="submit"
        isUnavailable={!canSend}
        className={classes.composerSend}
        leftSection={<IconSend {...ICON_PROPS} />}
      >
        {isSending ? "Sending" : "Send"}
      </FocusKeepingButton>
      {pinnedAt === undefined ? (
        <span className={classes.composerHint}>{goesTo}</span>
      ) : (
        <>
          <span className={classes.composerHint}>
            {`Pinned to ${clockLabel(pinnedAt)}`}
          </span>
          <Button variant="default" size="sm" onClick={onUnpin}>
            Unpin
          </Button>
        </>
      )}
    </div>
  );
}

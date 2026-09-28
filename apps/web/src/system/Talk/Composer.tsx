import { Button, Textarea } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import { ICON_PROPS } from "@/system/icons";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import classes from "@/system/system.module.css";

type Props = {
  goesTo: string;
  pinnedAt?: number;
  onClearPin?: () => void;
};

/**
 * The composer. Empty and disabled, typing and enabled, sending, and back to
 * empty: the states a real one needs, because a viewer who cannot work out
 * how to leave a comment is a product failure.
 */
export function Composer({
  goesTo,
  pinnedAt,
  onClearPin,
}: Readonly<Props>): ReactNode {
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const hasText = body.trim().length > 0;

  return (
    <form
      className={classes.composer}
      onSubmit={(event) => {
        event.preventDefault();
        setIsSending(true);
        window.setTimeout(() => {
          setIsSending(false);
          setBody("");
        }, 900);
      }}
    >
      <Textarea
        label={
          pinnedAt === undefined
            ? "Say something"
            : `Say something at ${clockLabel(pinnedAt)}`
        }
        placeholder="Anything at all. They will be glad you did."
        value={body}
        onChange={(event) => {
          return setBody(event.currentTarget.value);
        }}
        classNames={{
          label: classes.composerLabel,
          input: classes.composerField,
        }}
      />
      <div className={classes.composerRow}>
        <Button
          type="submit"
          disabled={!hasText || isSending}
          className={classes.composerSend}
          leftSection={<IconSend {...ICON_PROPS} />}
        >
          {isSending ? "Sending" : "Send"}
        </Button>
        {pinnedAt === undefined ? (
          <span className={classes.composerHint}>{goesTo}</span>
        ) : (
          <>
            <span className={classes.composerHint}>
              {`Pinned to ${clockLabel(pinnedAt)}`}
            </span>
            <Button variant="default" size="sm" onClick={onClearPin}>
              Unpin
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

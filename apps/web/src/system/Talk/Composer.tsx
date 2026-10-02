import { Button, Textarea } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import { ICON_PROPS } from "@/system/icons";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  goesTo: string;
  /**
   * Sends the words. Call `onSent` once the server has them, which is the
   * only thing that clears the field: a send that fails keeps every word.
   */
  onSend: (body: string, onSent: () => void) => void;
  isSending: boolean;
  /** Why the last send did not go through, already in words. */
  error?: string;
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
  onSend,
  isSending,
  error,
  pinnedAt,
  onClearPin,
}: Readonly<Props>): ReactNode {
  const [body, setBody] = useState("");
  const canSend = body.trim().length > 0 && !isSending;

  return (
    <form
      className={classes.composer}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) {
          const sent = body;
          // Words typed while the send was on its way are not the words
          // that arrived, so only a field still holding `sent` is cleared.
          onSend(sent, () => {
            setBody((current) => {
              return current === sent ? "" : current;
            });
          });
        }
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
          disabled={!canSend}
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
      {error === undefined ? null : <Prose role="alert">{error}</Prose>}
    </form>
  );
}

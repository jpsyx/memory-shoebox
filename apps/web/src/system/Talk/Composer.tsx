import { Textarea } from "@mantine/core";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { ComposerSendRow } from "@/system/Talk/ComposerSendRow";
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
  /** Takes the pin away. Focus moves to the field, since Unpin goes with it. */
  onClearPin?: () => void;
};

/** The words being written, and whether and how they can be sent. */
type ComposerDraft = {
  body: string;
  setBody: (body: string) => void;
  canSend: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/** Holds the words, and sends them on submit while there are any. */
function useComposerDraft(
  options: Readonly<Pick<Props, "onSend" | "isSending">>,
): ComposerDraft {
  const { onSend, isSending } = options;
  const [body, setBody] = useState("");
  const canSend = body.trim().length > 0 && !isSending;
  return {
    body,
    setBody,
    canSend,
    onSubmit: (event) => {
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
    },
  };
}

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
  const draft = useComposerDraft({ onSend, isSending });
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  return (
    <form className={classes.composer} onSubmit={draft.onSubmit}>
      <Textarea
        ref={fieldRef}
        label={
          pinnedAt === undefined
            ? "Say something"
            : `Say something at ${clockLabel(pinnedAt)}`
        }
        placeholder="Anything at all. They will be glad you did."
        value={draft.body}
        onChange={(event) => {
          return draft.setBody(event.currentTarget.value);
        }}
        classNames={{
          label: classes.composerLabel,
          input: classes.composerField,
        }}
      />
      <ComposerSendRow
        goesTo={goesTo}
        canSend={draft.canSend}
        isSending={isSending}
        pinnedAt={pinnedAt}
        onUnpin={() => {
          onClearPin?.();
          // Unpin leaves as it is pressed, and would take focus with it.
          fieldRef.current?.focus();
        }}
      />
      {error === undefined ? null : <Prose role="alert">{error}</Prose>}
    </form>
  );
}

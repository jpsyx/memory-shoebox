import { Textarea } from "@mantine/core";
import {
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { isFocusLostOrWithin } from "@/system/focusHelpers";
import { clockLabel } from "@/system/labelHelpers/labelHelpers";
import { ComposerSendRow } from "@/system/Talk/Composer/ComposerSendRow";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = {
  goesTo?: string;
  /**
   * Sends the words. Call `onSent` once the server has them, which is the
   * only thing that clears the field: a send that fails keeps every word.
   */
  onSend: (options: Readonly<{ body: string; onSent: () => void }>) => void;
  isSending: boolean;
  /** Why the last send did not go through, already in words. */
  error?: string;
  pinnedAt?: number;
  /** Takes the pin away. Focus moves to the field, since Unpin goes with it. */
  onClearPin?: () => void;
  /** The field, for a caller that gives it focus too, as after a delete. */
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
};

/** The words being written, and whether and how they can be sent. */
type ComposerDraft = {
  body: string;
  setBody: (body: string) => void;
  canSend: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  formRef: RefObject<HTMLFormElement | null>;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
};

/** Holds the words, and sends them on submit while there are any. */
function useComposerDraft(
  options: Readonly<Pick<Props, "onSend" | "isSending" | "fieldRef">>,
): ComposerDraft {
  const { onSend, isSending } = options;
  const [body, setBody] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const ownFieldRef = useRef<HTMLTextAreaElement>(null);
  const fieldRef = options.fieldRef ?? ownFieldRef;
  const canSend = body.trim().length > 0 && !isSending;
  return {
    body,
    setBody,
    canSend,
    formRef,
    fieldRef,
    onSubmit: (event) => {
      event.preventDefault();
      if (canSend) {
        const sent = body;
        // Words typed while the send was on its way are not the words
        // that arrived, so only a field still holding `sent` is cleared.
        onSend({
          body: sent,
          onSent: () => {
            setBody((current) => {
              return current === sent ? "" : current;
            });
            // Send kept focus while the words were out. More words are the
            // likely next thing, so the field takes it, unless focus moved
            // on.
            if (isFocusLostOrWithin(formRef.current ?? undefined)) {
              fieldRef.current?.focus();
            }
          },
        });
      }
    },
  };
}

/** The field's name, which says the moment a pinned comment will stand at. */
function _fieldLabel(pinnedAt: number | undefined): string {
  return pinnedAt === undefined
    ? "Say something"
    : `Say something at ${clockLabel(pinnedAt)}`;
}

/**
 * The composer. Empty and disabled, typing and enabled, sending, and back to
 * empty: the states a real one needs, because a viewer who cannot work out
 * how to leave a comment is a product failure. Send keeps focus through
 * sending, and the field takes it back once the words have arrived.
 */
export function Composer({
  goesTo,
  onSend,
  isSending,
  error,
  pinnedAt,
  onClearPin,
  fieldRef,
}: Readonly<Props>): ReactNode {
  const draft = useComposerDraft({ onSend, isSending, fieldRef });

  return (
    <form
      ref={draft.formRef}
      className={classes.composer}
      onSubmit={draft.onSubmit}
    >
      <Textarea
        ref={draft.fieldRef}
        label={_fieldLabel(pinnedAt)}
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
          draft.fieldRef.current?.focus();
        }}
      />
      {error === undefined ? null : <Prose role="alert">{error}</Prose>}
    </form>
  );
}

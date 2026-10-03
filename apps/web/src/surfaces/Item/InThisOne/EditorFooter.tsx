import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";

type Props = {
  /** Whatever the last save said went wrong, already in words. */
  error: string | undefined;
  onDone: () => void;
};

/**
 * Under a field that saves as it changes: the failure, if there was one, and
 * Done, which only closes the field because there is nothing left to save.
 */
export function EditorFooter({ error, onDone }: Readonly<Props>): ReactNode {
  return (
    <>
      {error === undefined ? null : <Prose role="alert">{error}</Prose>}
      <ChipRow>
        <Button variant="default" onClick={onDone}>
          Done
        </Button>
      </ChipRow>
    </>
  );
}

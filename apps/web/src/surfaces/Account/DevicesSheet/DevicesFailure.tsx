import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";

/** Props for the failure line, and the one way out of it there is. */
type Props = {
  error: string | undefined;
  onRetry: (() => void) | undefined;
};

/**
 * Whatever has just failed, and the thing to do about it, in the order they
 * are read: the sentence first, then the button.
 *
 * The two are separate props rather than one, because they do not always
 * arrive together: a sign-out that failed has a sentence and nothing to
 * retry, since the button that started it is still sitting in its row.
 */
export function DevicesFailure({ error, onRetry }: Readonly<Props>): ReactNode {
  return (
    <>
      {error === undefined ? null : <Prose role="alert">{error}</Prose>}
      {onRetry === undefined ? null : (
        <ChipRow>
          <Button variant="default" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </ChipRow>
      )}
    </>
  );
}

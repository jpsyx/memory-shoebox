import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
type Props = { onRetry: () => void };
/** A read retry leaves previously confirmed rows and words in place. */
export function RemovalReadFailure({ onRetry }: Readonly<Props>): ReactNode {
  return (
    <>
      <Prose onPanel role="alert">
        We could not refresh this history. Try again.
      </Prose>
      <Button onClick={onRetry}>Try again</Button>
    </>
  );
}

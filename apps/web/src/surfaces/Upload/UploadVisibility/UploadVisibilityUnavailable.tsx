import { Prose } from "@/system/typography/Prose";
import { Button } from "@mantine/core";
import type { ReactNode } from "react";
type Props = { isUnavailable: boolean; onRetry: () => void };
/** Directory failure never changes the selected rule. */
export function UploadVisibilityUnavailable({
  isUnavailable,
  onRetry,
}: Readonly<Props>): ReactNode {
  return isUnavailable ? (
    <div role="alert">
      <Prose>
        Some visibility choices are unavailable. Your saved restriction is still
        in place.
      </Prose>
      <Button variant="default" onClick={onRetry}>
        Retry visibility choices
      </Button>
    </div>
  ) : null;
}

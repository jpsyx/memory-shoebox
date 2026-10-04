import { Progress, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { UploadSnapshot } from "@/upload/uploadSessionController/uploadSessionController.types";
import { Sheet } from "@/system/Chrome/Sheet";
import { Prose } from "@/system/typography/Prose";
type Props = { snapshot: UploadSnapshot };
/** Loading, declaration and recovery hashing expose counts without polling. */
export function UploadLoading({ snapshot }: Readonly<Props>): ReactNode {
  const isChecking = snapshot.phase === "checking";
  const count = isChecking ? snapshot.checkingCount : snapshot.declaredCount;
  const total = isChecking ? snapshot.checkingTotal : snapshot.declarationTotal;
  return (
    <Sheet wide label="Reading this batch">
      <Stack gap="sm">
        <Prose>
          {snapshot.phase === "loading"
            ? "Reading your saved batch…"
            : isChecking
              ? `Checking ${count} of ${total} files against what is saved…`
              : `Saving ${count} of ${total} chosen files…`}
        </Prose>
        {total > 0 ? (
          <Progress aria-label="Files checked" value={(100 * count) / total} />
        ) : null}
      </Stack>
    </Sheet>
  );
}

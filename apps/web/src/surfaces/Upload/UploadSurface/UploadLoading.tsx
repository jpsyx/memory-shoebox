import { Sheet } from "@/system/Chrome/Sheet";
import { Prose } from "@/system/typography/Prose";
import type { UploadSnapshot } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import { Progress, Stack } from "@mantine/core";
import type { ReactNode } from "react";
type Props = { snapshot: UploadSnapshot };
/** Loading, declaration and recovery hashing expose counts without polling. */
export function UploadLoading({ snapshot }: Readonly<Props>): ReactNode {
  const isChecking = snapshot.phase === "checking";
  const processedFileCount = isChecking
    ? snapshot.checkingCount
    : snapshot.declaredCount;
  const totalFileCount = isChecking
    ? snapshot.checkingTotal
    : snapshot.declarationTotal;
  return (
    <Sheet wide label="Reading this batch">
      <Stack gap="sm">
        <Prose>
          {snapshot.phase === "loading"
            ? "Reading your saved batch…"
            : isChecking
              ? `Checking ${processedFileCount} of ${totalFileCount} files against what is saved…`
              : `Saving ${processedFileCount} of ${totalFileCount} chosen files…`}
        </Prose>
        {totalFileCount > 0 ? (
          <Progress
            aria-label="Files checked"
            value={(100 * processedFileCount) / totalFileCount}
          />
        ) : null}
      </Stack>
    </Sheet>
  );
}

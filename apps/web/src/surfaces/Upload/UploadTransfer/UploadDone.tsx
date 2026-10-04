import { Button, Stack } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Sheet } from "@/system/Chrome/Sheet";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";
import { UploadOutcome } from "./UploadOutcome";
import type { UploadSnapshot } from "@/upload/uploadSessionController/uploadSessionController.types";
type Props = { snapshot: UploadSnapshot; onUploadMore: () => void };
/** Server outcome totals describe the finished batch, never email delivery. */
export function UploadDone({
  snapshot,
  onUploadMore,
}: Readonly<Props>): ReactNode {
  const summary = snapshot.detail!.summary;
  const silent = [...snapshot.fileActivityById.values()].some((activity) => {
    return activity.isIncludedInEmail === false;
  });
  return (
    <Sheet wide label="What happened">
      <Stack gap="md">
        {summary ? (
          <>
            <UploadOutcome summary={summary} />{" "}
          </>
        ) : (
          <Prose>Read this batch again to see its finished summary.</Prose>
        )}
        {silent ? (
          <Prose>
            This photograph will appear on its day without another email.
          </Prose>
        ) : null}
        <ChipRow>
          <Button component={Link} to="/">
            See them on the pile
          </Button>
          <Button variant="panel" onClick={onUploadMore}>
            Upload more
          </Button>
        </ChipRow>
      </Stack>
    </Sheet>
  );
}

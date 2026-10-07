import {
  dayLabel,
  getWallClockFromCapture,
} from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import { Stack } from "@mantine/core";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { removalStateLabel } from "../../removalCopyHelpers/removalCopyHelpers";
import classes from "./RemovalRequestWords.module.css";
type Props = { request: RemovalRequestDto; timezone: string };
function _instantDayLabel({
  capturedAt,
  timezone,
}: Readonly<{ capturedAt: string; timezone: string }>): string {
  return dayLabel(getWallClockFromCapture({ capturedAt, timezone }).date);
}
/**
 * The original words, snapshot names, and timestamps of the private exchange.
 */
export function RemovalRequestWords({
  request,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="xs" className={classes.removalRequestWordsRoot}>
      <LabelText component="h3">
        {removalStateLabel(request.state)} ·{" "}
        {_instantDayLabel({ capturedAt: request.createdAt, timezone })}
      </LabelText>
      <p className={classes.removalRequestWordsTitle}>
        {request.requestedBy.displayName} is tagged in this one
      </p>
      <Prose>
        Put up by {request.uploadedBy.displayName}
        {request.itemCapturedAt === null
          ? ""
          : ` · ${_instantDayLabel({ capturedAt: request.itemCapturedAt, timezone })}`}
      </Prose>
      <Prose className={classes.removalRequestWordsExact}>
        {request.reason ?? "No reason given."}
      </Prose>
      {request.resolvedBy === null ? null : (
        <Prose>
          Answered by {request.resolvedBy.displayName}
          {request.resolvedAt === null
            ? ""
            : ` · ${_instantDayLabel({ capturedAt: request.resolvedAt, timezone })}`}
        </Prose>
      )}
      {request.declineReason === null ? null : (
        <>
          <LabelText component="h4">
            What {request.resolvedBy?.displayName ?? "the responder"} said back
          </LabelText>
          <Prose className={classes.removalRequestWordsExact}>
            {request.declineReason}
          </Prose>
        </>
      )}
    </Stack>
  );
}

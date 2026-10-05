import {
  dayLabel,
  getWallClockFromCapture,
} from "@/system/labelHelpers/labelHelpers";
import { Stack } from "@mantine/core";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import { removalStateLabel } from "../removalCopyHelpers/removalCopyHelpers";
import classes from "./RemovalRequestCard.module.css";

type Props = { request: RemovalRequestDto; timezone: string };
function _instantDayLabel(capturedAt: string, timezone: string): string {
  return dayLabel(getWallClockFromCapture({ capturedAt, timezone }).date);
}
/** The original words, snapshot names, and timestamps of the private exchange. */
export function RemovalRequestWords({
  request,
  timezone,
}: Readonly<Props>): ReactNode {
  return (
    <Stack gap="xs" className={classes.words}>
      <LabelText component="h3">
        {removalStateLabel(request.state)} ·{" "}
        {_instantDayLabel(request.createdAt, timezone)}
      </LabelText>
      <p className={classes.title}>
        {request.requestedBy.displayName} is tagged in this one
      </p>
      <Prose>
        Put up by {request.uploadedBy.displayName}
        {request.itemCapturedAt === null
          ? ""
          : ` · ${_instantDayLabel(request.itemCapturedAt, timezone)}`}
      </Prose>
      <Prose className={classes.exact}>
        {request.reason ??
          "No reason given, which is allowed. Asking is enough."}
      </Prose>
      {request.resolvedBy === null ? null : (
        <Prose>
          Answered by {request.resolvedBy.displayName}
          {request.resolvedAt === null
            ? ""
            : ` · ${_instantDayLabel(request.resolvedAt, timezone)}`}
        </Prose>
      )}
      {request.declineReason === null ? null : (
        <>
          <LabelText component="h4">
            What {request.resolvedBy?.displayName ?? "the responder"} said back
          </LabelText>
          <Prose className={classes.exact}>{request.declineReason}</Prose>
        </>
      )}
    </Stack>
  );
}

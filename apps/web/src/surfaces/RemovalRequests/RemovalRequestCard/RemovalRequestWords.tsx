import { Stack } from "@mantine/core";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import { removalStateLabel } from "../removalCopyHelpers/removalCopyHelpers";
import classes from "./RemovalRequestCard.module.css";

type Props = { request: RemovalRequestDto };
/** The original words, snapshot names, and timestamps of the private exchange. */
export function RemovalRequestWords({ request }: Readonly<Props>): ReactNode {
  return (
    <Stack gap="xs" className={classes.words}>
      <LabelText component="h3">
        {removalStateLabel(request.state)} · {request.createdAt.slice(0, 10)}
      </LabelText>
      <p className={classes.title}>
        {request.requestedBy.displayName} is tagged in this one
      </p>
      <Prose>
        Put up by {request.uploadedBy.displayName}
        {request.itemCapturedAt === null
          ? ""
          : ` · ${request.itemCapturedAt.slice(0, 10)}`}
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
            : ` · ${request.resolvedAt.slice(0, 10)}`}
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

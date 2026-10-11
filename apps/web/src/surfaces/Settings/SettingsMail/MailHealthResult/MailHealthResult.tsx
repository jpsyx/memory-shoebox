import { Group, Stack } from "@mantine/core";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import type { MailHealthResponse } from "@memory-shoebox/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import { MailHealthFacts } from "./MailHealthFacts/MailHealthFacts";
import classes from "./MailHealthResult.module.css";

type Props = { health: UseQueryResult<MailHealthResponse>; timezone: string };

function _mailHealthStatusCopy(
  health: UseQueryResult<MailHealthResponse>,
): string {
  if (health.isFetching || health.isPending) {
    return "Checking mail health…";
  }
  if (health.isError) {
    return "Couldn’t check mail health. Try again.";
  }
  return health.data?.status === "ok"
    ? "Check complete. No current mail problems found."
    : "Check complete. Mail needs attention.";
}

/** Announces completed health reads separately from request failures. */
export function MailHealthResult({
  health,
  timezone,
}: Readonly<Props>): ReactNode {
  const isChecking = health.isFetching || health.isPending;
  const StatusIcon =
    health.isError || health.data?.status !== "ok"
      ? IconAlertTriangle
      : IconCheck;
  return (
    <Stack
      gap="xs"
      role="status"
      aria-label="Mail health"
      aria-live="polite"
      aria-atomic="true"
    >
      <Group gap="xs" wrap="nowrap" align="flex-start">
        {isChecking ? null : (
          <StatusIcon
            size="1.25rem"
            stroke={1.5}
            aria-hidden="true"
            className={classes.mailHealthResultIcon}
          />
        )}
        <Prose>
          <strong>{_mailHealthStatusCopy(health)}</strong>
        </Prose>
      </Group>
      {isChecking || health.data === undefined ? null : (
        <MailHealthFacts
          data={health.data}
          checkedAt={health.dataUpdatedAt}
          isPrevious={health.isError}
          timezone={timezone}
        />
      )}
    </Stack>
  );
}

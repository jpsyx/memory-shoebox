import { Stack } from "@mantine/core";
import type { ReleaseStatusResponse } from "@memory-shoebox/shared";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { releaseStatusQueryOptions } from "@/api/releaseStatus";
import { useMemberReadAuthority } from "@/surfaces/Members/useMemberReadAuthority";
import { Prose } from "@/system/typography/Prose";

type Props = { version: string };

function _versionStatusCopy(
  status: Readonly<ReleaseStatusResponse> | undefined,
): string {
  switch (status?.status) {
    case "up_to_date":
      return "Up to date.";
    case "update_available":
      return `New version available: ${status.latestVersion}.`;
    default:
      return "Could not check for updates right now.";
  }
}

/** Shows the installed version even while the independent update check fails. */
export function SettingsVersion({ version }: Readonly<Props>): ReactNode {
  const release = useQuery(releaseStatusQueryOptions);
  useMemberReadAuthority(release.error ?? undefined);
  return (
    <Stack gap="xs">
      <Prose onPanel>Version: {version}</Prose>
      <Prose onPanel role="status">
        {release.isPending
          ? "Checking for updates…"
          : _versionStatusCopy(release.isError ? undefined : release.data)}
      </Prose>
    </Stack>
  );
}

import { Group, Skeleton, Stack, Title } from "@mantine/core";
import type { MemberRef } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { MemberAvatar } from "@/system/MemberAvatar/MemberAvatar";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";

type Props = { member: MemberRef | undefined; isPending: boolean };

/** A reserved identity footprint without account details or totals. */
export function MemberCollectionIdentity({
  member,
  isPending,
}: Readonly<Props>): ReactNode {
  return (
    <Group align="flex-start" wrap="nowrap" gap="md" aria-busy={isPending}>
      {member ? (
        <MemberAvatar key={member.memberId} member={member} size={56} />
      ) : (
        <Skeleton width={56} height={56} radius="100%" animate={isPending} />
      )}
      <Stack gap="xs" miw={0}>
        <Title order={1} className={classes.headline}>
          {member?.displayName ?? "Photos and videos"}
        </Title>
        <Prose onPanel>
          {member
            ? `Photos and videos uploaded by or photo-tagged with ${member.displayName}`
            : "Photos and videos uploaded by or photo-tagged with this member"}
        </Prose>
      </Stack>
    </Group>
  );
}

import { Button, Group, Stack } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMemberCollection } from "@/api/memberCollections/memberCollections";
import { IconArrowLeft } from "@tabler/icons-react";
import { ICON_PROPS } from "@/system/icons";
import classes from "@/system/system.module.css";
import { MemberCollectionIdentity } from "./MemberCollectionIdentity";

type Props = { memberId: string };

/** Account identity above the existing pile, including direct URL entry. */
export function MemberCollectionHeader({
  memberId,
}: Readonly<Props>): ReactNode {
  const identity = useMemberCollection(memberId);
  return (
    <section className={classes.pageWide} aria-label="Member collection">
      <Stack gap="md">
        <Link to="/" search={{}} className={classes.backlink}>
          <IconArrowLeft {...ICON_PROPS} />
          Back to the timeline
        </Link>
        <MemberCollectionIdentity
          member={identity.data?.member ?? undefined}
          isPending={identity.isPending}
        />
        {identity.isError ? (
          <Group>
            <p role="alert">Couldn't load these photos and videos.</p>
            <Button
              variant="panel"
              onClick={() => {
                void identity.refetch();
              }}
            >
              Try again
            </Button>
          </Group>
        ) : null}
      </Stack>
    </section>
  );
}

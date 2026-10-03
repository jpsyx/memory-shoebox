import { Button, Stack } from "@mantine/core";
import { useState, type ReactNode } from "react";
import type { ItemDetail, MemberRef } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Sheet } from "@/system/Chrome/Sheet";
import { visibilityLabel } from "@/system/labelHelpers/labelHelpers";
import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import classes from "@/system/system.module.css";
import { visibilityProse } from "@/surfaces/Item/itemCopy/itemCopy";
import { VisibilityEditor } from "@/surfaces/Item/WhoCanSee/VisibilityEditor";

type Props = {
  detail: ItemDetail;
  viewer: MemberRef;
};

/**
 * Who can see it, for whoever put it there or runs the archive: the rule in
 * words, and a way to change it. The caller draws this only when
 * `capabilities.canSetVisibility` says so.
 */
export function WhoCanSee({ detail, viewer }: Readonly<Props>): ReactNode {
  const [isEditing, setIsEditing] = useState(false);
  return (
    <Sheet label="Who can see this">
      {isEditing ? (
        <VisibilityEditor
          detail={detail}
          viewer={viewer}
          onDone={() => {
            return setIsEditing(false);
          }}
        />
      ) : (
        <Stack gap="sm">
          <LabelText component="h2">Who can see this</LabelText>
          <p className={classes.title}>{visibilityLabel(detail.visibility)}</p>
          <Prose>
            {visibilityProse({
              kind: detail.kind,
              mode: detail.visibility.mode,
            })}
          </Prose>
          <ChipRow>
            <Button
              variant="default"
              onClick={() => {
                return setIsEditing(true);
              }}
            >
              Change who can see it
            </Button>
          </ChipRow>
        </Stack>
      )}
    </Sheet>
  );
}

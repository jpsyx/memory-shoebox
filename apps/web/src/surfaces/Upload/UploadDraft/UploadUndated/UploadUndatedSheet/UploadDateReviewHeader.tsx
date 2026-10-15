import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import { Button, Group } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { useUploadDateReviewBatchForm } from "./useUploadDateReviewBatchForm";
import classes from "./UploadUndatedSheet.module.css";

type Props = {
  count: number;
  form: ReturnType<typeof useUploadDateReviewBatchForm>;
  isDisabled: boolean;
};

/** Explains the required date review and confirms every displayed day together. */
export function UploadDateReviewHeader({
  count,
  form,
  isDisabled,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <Group justify="space-between">
        <LabelText component="h2" className={classes.reviewHeading}>
          <IconAlertTriangle size={24} aria-hidden="true" />
          {count} {count === 1 ? "date needs" : "dates need"} confirmation
        </LabelText>
        <Button
          disabled={!form.isValid || form.isPending || isDisabled}
          loading={form.isPending}
          onClick={() => {
            void form.onSubmit();
          }}
        >
          Confirm all
        </Button>
      </Group>
      <Prose className={classes.reviewProse}>
        These files have no reliable capture date. Check each suggested day or
        change it, then confirm to continue.
      </Prose>
      {form.error ? <p role="alert">{form.error}</p> : null}
    </>
  );
}

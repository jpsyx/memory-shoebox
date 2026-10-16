import { LabelText } from "@/system/typography/LabelText";
import { Prose } from "@/system/typography/Prose";
import { Button, Group } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { useUploadDateReviewBatchForm } from "../useUploadDateReviewBatchForm";
import classes from "./UploadDateReviewHeader.module.css";

type Props = {
  unconfirmedDateCount: number;
  form: ReturnType<typeof useUploadDateReviewBatchForm>;
  isDisabled: boolean;
};

/**
 * Explains the required date review and confirms every displayed day together.
 */
export function UploadDateReviewHeader({
  unconfirmedDateCount,
  form,
  isDisabled,
}: Readonly<Props>): ReactNode {
  return (
    <>
      <Group justify="space-between">
        <LabelText
          component="h2"
          className={classes.uploadDateReviewHeaderHeading}
        >
          <IconAlertTriangle size={24} aria-hidden="true" />
          {unconfirmedDateCount}{" "}
          {unconfirmedDateCount === 1 ? "date needs" : "dates need"}{" "}
          confirmation
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
      <Prose className={classes.uploadDateReviewHeaderProse}>
        These files have no reliable capture date. Check each suggested day or
        change it, then confirm to continue.
      </Prose>
      {form.error ? <p role="alert">{form.error}</p> : null}
    </>
  );
}

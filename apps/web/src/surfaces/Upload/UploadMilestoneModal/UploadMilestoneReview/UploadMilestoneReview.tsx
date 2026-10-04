import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { useUploadMilestoneForm } from "../useUploadMilestoneForm";
import classes from "./UploadMilestoneReview.module.css";
type Props = {
  form: ReturnType<typeof useUploadMilestoneForm>;
  isLocked: boolean;
};
/** A lost create answer requires a list reload and deliberate review. */
export function UploadMilestoneReview({
  form,
  isLocked,
}: Readonly<Props>): ReactNode {
  const buttonProps = {
    variant: "default" as const,
    disabled: isLocked,
    className: classes.uploadMilestoneReviewWrappingButton,
    classNames: { label: classes.uploadMilestoneReviewWrappingButtonLabel },
  };
  return form.isUncertain ? (
    <>
      <Button
        {...buttonProps}
        onClick={() => {
          void form.onReload();
        }}
      >
        Reload milestones to review
      </Button>
      {form.isReviewed ? (
        <Button
          {...buttonProps}
          onClick={() => {
            return form.patch({
              isUncertain: false,
              isCreating: true,
              error: undefined,
            });
          }}
        >
          I reviewed the list; create another occasion
        </Button>
      ) : null}
    </>
  ) : (
    <Button
      {...buttonProps}
      disabled={isLocked || !!form.created}
      onClick={() => {
        return form.patch({ isCreating: true });
      }}
    >
      Create a new milestone for these
    </Button>
  );
}

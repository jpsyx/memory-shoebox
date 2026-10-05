import { Button, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { useSetupCreation } from "./useSetupCreation";
import classes from "./Setup.module.css";

type Props = { form: ReturnType<typeof useSetupCreation> };
/** The normalized address is reviewed before the irreversible identity write. */
export function SetupEmailReview({ form }: Readonly<Props>): ReactNode {
  if (form.review === undefined) {
    return null;
  }
  return (
    <section aria-label="Review your email" className={classes.notice}>
      <Text fw={700}>{form.review.admin.email}</Text>
      <Text>
        This is your permanent sign-in address. Check it carefully: future
        sign-ins use a code emailed here.
      </Text>
      <Button variant="default" onClick={form.onEdit} disabled={form.isPending}>
        Go back and edit
      </Button>
    </section>
  );
}

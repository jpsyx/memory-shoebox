import { Lede } from "@/system/typography/Lede";
import { Button, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { SetupFieldList } from "../SetupFieldList";
import { SetupLayout } from "../SetupLayout/SetupLayout";
import { SetupEmailReview } from "./SetupEmailReview/SetupEmailReview";
import classes from "./SetupForm.module.css";
import { SetupSettings } from "./SetupSettings";
import { useSetupCreation } from "./useSetupCreation/useSetupCreation";

/** First active administrator, with an explicit permanent-address review. */
export function SetupForm(): ReactNode {
  const form = useSetupCreation();
  return (
    <SetupLayout shoeboxName={form.fields["shoebox.name"] || "Shoebox"}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          form.onSubmit();
        }}
      >
        <Stack gap="lg">
          <Lede>Set up your Shoebox.</Lede>
          <Text>
            Your account will be the first administrator. You can start
            uploading before email is configured.
          </Text>
          <SetupFieldList
            fields={form.fields}
            errors={form.errors}
            isDisabled={form.isPending}
            onChange={form.onChange}
            section="account"
          />
          <SetupSettings form={form} />
          <SetupEmailReview form={form} />
          {form.error === undefined ? null : (
            <Text role="alert" className={classes.setupFormError}>
              {form.error}
            </Text>
          )}
          <Button type="submit" loading={form.isPending}>
            {form.review === undefined
              ? "Review your email"
              : "Create your Shoebox"}
          </Button>
        </Stack>
      </form>
    </SetupLayout>
  );
}

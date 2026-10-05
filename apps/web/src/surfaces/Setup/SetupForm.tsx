import { Button, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { Lede } from "@/system/typography/Lede";
import { SetupFieldList } from "./SetupFieldList";
import { SetupSettings } from "./SetupSettings";
import { SetupEmailReview } from "./SetupEmailReview";
import { SetupLayout } from "./SetupLayout";
import { useSetupCreation } from "./useSetupCreation";
import classes from "./Setup.module.css";

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
            <Text role="alert" className={classes.error}>
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

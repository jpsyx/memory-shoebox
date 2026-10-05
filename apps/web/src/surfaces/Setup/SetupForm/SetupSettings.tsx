import { Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { SetupFieldList } from "../SetupFieldList";
import type { useSetupCreation } from "./useSetupCreation/useSetupCreation";

type Props = { form: ReturnType<typeof useSetupCreation> };
/** Public link destination and optional independently configured sender. */
export function SetupSettings({ form }: Readonly<Props>): ReactNode {
  return (
    <section aria-labelledby="setup-settings">
      <Title order={2} id="setup-settings">
        Address and email settings
      </Title>
      <Text mb="md">
        The public URL is where invitation links will go. A sender email needs a
        verified sending domain; it can be set later.
      </Text>
      <SetupFieldList
        fields={form.fields}
        errors={form.errors}
        isDisabled={form.isPending}
        onChange={form.onChange}
        section="settings"
      />
    </section>
  );
}

import { Stack, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import type { SetupDraft } from "./setupFlow.types";
import type { SetupFieldErrors, SetupFields } from "./setupFormHelpers";

type Props = {
  fields: SetupFields;
  errors: SetupFieldErrors;
  isDisabled: boolean;
  onChange: SetupDraft["onChange"];
  section: "account" | "settings";
};
const FIELD_LABELS = {
  "shoebox.name": "Shoebox name",
  "admin.displayName": "Your name",
  "admin.email": "Your email",
  "shoebox.timezone": "Timezone",
  "public.baseUrl": "Public URL",
  "mail.fromAddress": "Sender email (optional)",
  "mail.fromName": "Sender name (optional)",
} as const satisfies Record<keyof SetupFields, string>;
const ACCOUNT_FIELDS = [
  "shoebox.name",
  "admin.displayName",
  "admin.email",
  "shoebox.timezone",
] as const satisfies ReadonlyArray<keyof SetupFields>;

/**
 * Labelled incumbent inputs, keeping account and optional settings distinct.
 */
export function SetupFieldList({
  fields,
  errors,
  isDisabled,
  onChange,
  section,
}: Readonly<Props>): ReactNode {
  return (
    <Stack>
      {(section === "account"
        ? ACCOUNT_FIELDS
        : (["public.baseUrl", "mail.fromAddress", "mail.fromName"] as const)
      ).map((field) => {
        return (
          <TextInput
            key={field}
            name={field}
            label={FIELD_LABELS[field]}
            type={
              field.endsWith("email") || field === "mail.fromAddress"
                ? "email"
                : "text"
            }
            value={fields[field]}
            error={errors[field]}
            disabled={isDisabled}
            autoComplete={
              field === "admin.email"
                ? "email"
                : field === "admin.displayName"
                  ? "name"
                  : "off"
            }
            onChange={(event) => {
              return onChange({ field, value: event.currentTarget.value });
            }}
          />
        );
      })}
    </Stack>
  );
}

import { Stack, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import type { SetupFields, SetupFieldErrors } from "./setupFormHelpers";

type Props = {
  fields: SetupFields;
  errors: SetupFieldErrors;
  isDisabled: boolean;
  onChange: (field: keyof SetupFields, value: string) => void;
  section: "account" | "settings";
};
const FIELD_LABELS: Record<keyof SetupFields, string> = {
  "shoebox.name": "Shoebox name",
  "admin.displayName": "Your name",
  "admin.email": "Your email",
  "shoebox.timezone": "Timezone",
  "public.baseUrl": "Public URL",
  "mail.fromAddress": "Sender email (optional)",
  "mail.fromName": "Sender name (optional)",
};
const ACCOUNT_FIELDS: Array<keyof SetupFields> = [
  "shoebox.name",
  "admin.displayName",
  "admin.email",
  "shoebox.timezone",
];
const SETTINGS_FIELDS: Array<keyof SetupFields> = [
  "public.baseUrl",
  "mail.fromAddress",
  "mail.fromName",
];

/** Labelled incumbent inputs, keeping account and optional settings distinct. */
export function SetupFieldList({
  fields,
  errors,
  isDisabled,
  onChange,
  section,
}: Readonly<Props>): ReactNode {
  return (
    <Stack>
      {(section === "account" ? ACCOUNT_FIELDS : SETTINGS_FIELDS).map(
        (field) => {
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
                return onChange(field, event.currentTarget.value);
              }}
            />
          );
        },
      )}
    </Stack>
  );
}

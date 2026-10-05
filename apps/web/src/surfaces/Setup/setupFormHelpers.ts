import {
  createSetupRequestSchema,
  SETTING_DEFINITIONS,
} from "@memory-shoebox/shared";

/** Local field values; never written to browser storage or query strings. */
export type SetupFields = {
  "admin.displayName": string;
  "admin.email": string;
  "shoebox.name": string;
  "shoebox.timezone": string;
  "public.baseUrl": string;
  "mail.fromAddress": string;
  "mail.fromName": string;
};
/** Labelled fields and validation failures shared by the form pieces. */
export type SetupFieldErrors = Partial<Record<keyof SetupFields, string>>;

/** Browser defaults use a validated IANA zone with a safe UTC fallback. */
export function getSetupFieldsFromBrowser(): SetupFields {
  let timezone = "UTC";
  try {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (
      SETTING_DEFINITIONS["shoebox.timezone"].schema.safeParse(browserZone)
        .success
    ) {
      timezone = browserZone;
    }
  } catch {
    /* Missing browser timezone support keeps UTC. */
  }
  return {
    "admin.displayName": "",
    "admin.email": "",
    "shoebox.name": "My Shoebox",
    "shoebox.timezone": timezone,
    "public.baseUrl": window.location.origin,
    "mail.fromAddress": "",
    "mail.fromName": "",
  };
}
/** Maps local fields into the shared validated and normalized API contract. */
export function getSetupRequestFromFields(
  fields: Readonly<SetupFields>,
): ReturnType<typeof createSetupRequestSchema.safeParse> {
  return createSetupRequestSchema.safeParse({
    admin: {
      displayName: fields["admin.displayName"],
      email: fields["admin.email"],
    },
    shoebox: {
      name: fields["shoebox.name"],
      timezone: fields["shoebox.timezone"],
    },
    public: { baseUrl: fields["public.baseUrl"] },
    ...(fields["mail.fromAddress"].trim()
      ? {
          mail: {
            fromAddress: fields["mail.fromAddress"],
            fromName: fields["mail.fromName"].trim() || null,
          },
        }
      : {}),
  });
}
/** Error paths match input names, so their first field can receive focus. */
export function focusSetupField(errors: Readonly<SetupFieldErrors>): void {
  const firstField = Object.keys(errors)[0];
  if (firstField !== undefined) {
    document.getElementsByName(firstField)[0]?.focus();
  }
}

import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/** Chooses a timezone by searching its visible label. */
export async function selectTimezone({
  user,
  field,
  timezone,
}: Readonly<{
  user: UserEvent;
  field: HTMLElement;
  timezone: string;
}>): Promise<void> {
  await user.click(field);
  await user.clear(field);
  await user.type(field, timezone);
  await user.click(screen.getByRole("option", { name: timezone }));
}

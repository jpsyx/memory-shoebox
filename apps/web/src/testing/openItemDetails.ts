import { expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/** Open the current item's secondary controls and wait for the drawer entrance. */
export async function openItemDetails(): Promise<void> {
  await userEvent.click(
    await screen.findByRole("button", { name: /More (photo|video) details/ }),
  );
  await waitFor(() => {
    expect(
      screen.getByRole("dialog", { name: /^(Photo|Video) details$/ }),
    ).toBeVisible();
  });
}

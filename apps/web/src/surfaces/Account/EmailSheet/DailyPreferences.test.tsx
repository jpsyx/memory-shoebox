import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { EmailSheet } from "./EmailSheet";

it("offers three frequencies and saves a daily choice", async () => {
  const onSave = vi.fn();
  render(
    <MantineProvider>
      <EmailSheet
        notify={{
          onUpload: "daily" as const,
          onComment: "daily" as const,
          onCommentTag: "immediate" as const,
          onRemoval: true,
        }}
        timezone="UTC"
        error={undefined}
        isSaving={false}
        onSave={onSave}
      />
    </MantineProvider>,
  );
  expect(
    screen.getByRole("combobox", { name: "New photos/videos" }),
  ).toHaveValue("daily");
  const tag = screen.getByRole("combobox", { name: "Comment tags" });
  await userEvent.selectOptions(tag, "daily");
  expect(onSave).toHaveBeenCalledWith({
    onUpload: "daily" as const,
    onComment: "daily" as const,
    onCommentTag: "daily" as const,
    onRemoval: true,
  });
  expect(
    screen.queryByRole("option", { name: /weekly/i }),
  ).not.toBeInTheDocument();
});

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

it("keeps reload guidance visible beside a rejected comment-tag save", async () => {
  const notify = {
    onUpload: "daily",
    onComment: "daily",
    onCommentTag: "immediate",
    onRemoval: true,
  } as const;
  const onSave = vi.fn();
  const view = (error?: string) => {
    return (
      <MantineProvider>
        <EmailSheet
          notify={notify}
          timezone="UTC"
          error={error}
          isSaving={false}
          onSave={onSave}
        />
      </MantineProvider>
    );
  };
  const { rerender } = render(view());
  await userEvent.selectOptions(
    screen.getByRole("combobox", { name: "Comment tags" }),
    "daily",
  );
  rerender(view("Email settings have changed. Reload the page and try again."));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Email settings have changed. Reload the page and try again.",
  );
});

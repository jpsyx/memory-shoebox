import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { adminSettingsQueryOptions } from "@/api/adminSettings/adminSettings";
import {
  renderSettings,
  SETTINGS,
  IMPACT,
  saved,
} from "./SettingsSurface.fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});
const FRESH = {
  ...SETTINGS,
  shoebox: { name: "Fresh family", timezone: "UTC" },
  pile: { arrangement: "tidy" as const },
  mail: { ...SETTINGS.mail, fromAddress: "fresh@example.com" },
};
it("refreshes all pristine fields after mounting from an older cached response", async () => {
  const { router } = renderSettings();
  await screen.findByLabelText("Shoebox name");
  await act(async () => {
    await router.navigate({ to: "/account" });
  });
  const finish = _deferFreshSettingsRead();
  await act(async () => {
    await router.navigate({ to: "/settings" });
  });
  expect(await screen.findByLabelText("Shoebox name")).toHaveValue(
    SETTINGS.shoebox.name,
  );
  await act(async () => {
    finish();
  });
  await waitFor(() => {
    expect(screen.getByLabelText("Shoebox name")).toHaveValue("Fresh family");
  });
  expect(screen.getByLabelText("Sending address")).toHaveValue(
    "fresh@example.com",
  );
  expect(screen.getByLabelText("This Shoebox's timezone")).toHaveValue("UTC");
  expect(screen.getByRole("radio", { name: "Tidy" })).toBeChecked();
});
it("preserves dirty text while Cancel accepts the latest canonical baseline", async () => {
  const { queryClient } = renderSettings();
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Shoebox name");
  await user.clear(name);
  await user.type(name, "My deliberate edit");
  await act(async () => {
    queryClient.setQueryData(adminSettingsQueryOptions.queryKey, FRESH);
  });
  expect(name).toHaveValue("My deliberate edit");
  await user.click(
    within(
      screen.getByRole("region", { name: "The name of this Shoebox" }),
    ).getByRole("button", { name: "Cancel" }),
  );
  expect(name).toHaveValue("Fresh family");
});
it("invalidates timezone consent when a fresh saved baseline changes", async () => {
  const { queryClient } = renderSettings({
    routes: {
      "PATCH /api/settings?preview=true": {
        status: 200,
        body: { ...saved({}, IMPACT), isPreview: true },
      },
    },
  });
  const user = userEvent.setup();
  await user.selectOptions(
    await screen.findByLabelText("This Shoebox's timezone"),
    "Asia/Manila",
  );
  await user.click(
    screen.getByRole("button", { name: "Preview timezone change" }),
  );
  await screen.findByRole("button", { name: "Confirm timezone change" });
  await act(async () => {
    queryClient.setQueryData(adminSettingsQueryOptions.queryKey, FRESH);
  });
  await waitFor(() => {
    expect(
      screen.queryByRole("button", { name: "Confirm timezone change" }),
    ).not.toBeInTheDocument();
  });
  expect(screen.getByLabelText("This Shoebox's timezone")).toHaveValue(
    "Asia/Manila",
  );
  await act(async () => {
    queryClient.setQueryData(adminSettingsQueryOptions.queryKey, SETTINGS);
  });
  await waitFor(() => {
    expect(screen.getByLabelText("Shoebox name")).toHaveValue(
      SETTINGS.shoebox.name,
    );
  });
  expect(
    screen.queryByRole("button", { name: "Confirm timezone change" }),
  ).not.toBeInTheDocument();
});
it("defers canonical updates during a pending operation and preserves all dirty drafts", async () => {
  let finish = () => {};
  const pending = new Promise<void>((settle) => {
    finish = settle;
  });
  const { queryClient } = renderSettings({
    routes: {
      "PATCH /api/settings": {
        status: 503,
        body: { error: "unavailable", message: "Save unavailable" },
        waitFor: pending,
      },
    },
  });
  const { user, name, sender } = await _editAllSettings();
  await user.click(screen.getByRole("button", { name: "Save the new name" }));
  await act(async () => {
    queryClient.setQueryData(adminSettingsQueryOptions.queryKey, FRESH);
  });
  expect(name).toBeDisabled();
  expect(name).toHaveValue("Deliberate name");
  expect(sender).toHaveValue("draft@example.com");
  expect(screen.getByLabelText("This Shoebox's timezone")).toHaveValue(
    "Asia/Manila",
  );
  expect(screen.getByRole("radio", { name: "Tidy" })).toBeChecked();
  await act(async () => {
    finish();
  });
  await waitFor(() => {
    expect(name).toBeEnabled();
  });
  await user.click(
    within(
      screen.getByRole("region", { name: "The name of this Shoebox" }),
    ).getByRole("button", { name: "Cancel" }),
  );
  expect(name).toHaveValue("Fresh family");
  expect(sender).toHaveValue("draft@example.com");
});
it("does not accept an older pending preview after its saved baseline changes", async () => {
  let finish = () => {};
  const pending = new Promise<void>((settle) => {
    finish = settle;
  });
  const { queryClient } = renderSettings({
    routes: {
      "PATCH /api/settings?preview=true": {
        status: 200,
        body: { ...saved({}, IMPACT), isPreview: true },
        waitFor: pending,
      },
    },
  });
  const user = userEvent.setup();
  await user.selectOptions(
    await screen.findByLabelText("This Shoebox's timezone"),
    "Asia/Manila",
  );
  await user.click(
    screen.getByRole("button", { name: "Preview timezone change" }),
  );
  await act(async () => {
    queryClient.setQueryData(adminSettingsQueryOptions.queryKey, FRESH);
  });
  expect(screen.getByLabelText("This Shoebox's timezone")).toBeDisabled();
  await act(async () => {
    finish();
  });
  await waitFor(() => {
    expect(screen.getByLabelText("This Shoebox's timezone")).toBeEnabled();
  });
  expect(screen.getByLabelText("This Shoebox's timezone")).toHaveValue(
    "Asia/Manila",
  );
  expect(
    screen.queryByRole("button", { name: "Confirm timezone change" }),
  ).not.toBeInTheDocument();
});

type SavedField = "name" | "sender" | "arrangement" | "timezone";

it.each<SavedField>(["name", "sender", "arrangement", "timezone"])(
  "adopts restored canonical %s after an acknowledged save and delayed reconciliation",
  async (field) => {
    renderSettings({
      routes: {
        "PATCH /api/settings": {
          status: 200,
          body: _getSavedResponseFromField(field),
        },
        "PATCH /api/settings?preview=true": {
          status: 200,
          body: { ...saved({}, IMPACT), isPreview: true },
        },
      },
    });
    await screen.findByLabelText("Shoebox name");
    // Another administrator restores A before this post-save GET completes.
    const finish = _deferFreshSettingsRead(SETTINGS);
    const user = userEvent.setup();
    await _saveSettingField({ field, user });
    await waitFor(() => {
      expect(screen.getByLabelText("Shoebox name")).toBeDisabled();
      _expectSavedSettingField(field);
    });
    await act(async () => {
      finish();
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Shoebox name")).toBeEnabled();
      _expectRestoredSettingField(field);
    });
    if (field === "name") {
      const input = screen.getByLabelText("Shoebox name");
      await user.clear(input);
      await user.type(input, "Another deliberate edit");
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(input).toHaveValue("My Shoebox");
    }
  },
);

function _getSavedResponseFromField(
  field: SavedField,
): ReturnType<typeof saved> {
  switch (field) {
    case "name":
      return saved({ shoebox: { ...SETTINGS.shoebox, name: "Saved family" } });
    case "sender":
      return saved({
        mail: { ...SETTINGS.mail, fromAddress: "saved@example.com" },
      });
    case "arrangement":
      return saved({ pile: { arrangement: "tidy" } });
    case "timezone":
      return saved(
        { shoebox: { ...SETTINGS.shoebox, timezone: "Asia/Manila" } },
        IMPACT,
      );
  }
}

async function _saveSettingField(
  options: Readonly<{
    field: SavedField;
    user: ReturnType<typeof userEvent.setup>;
  }>,
): Promise<void> {
  const { field, user } = options;
  if (field === "name" || field === "sender") {
    const input = screen.getByLabelText(
      field === "name" ? "Shoebox name" : "Sending address",
    );
    await user.clear(input);
    await user.type(
      input,
      field === "name" ? "Saved family" : "saved@example.com",
    );
    await user.click(
      screen.getByRole("button", {
        name: field === "name" ? "Save the new name" : "Save sending address",
      }),
    );
  } else if (field === "arrangement") {
    await user.click(screen.getByRole("radio", { name: "Tidy" }));
    await user.click(screen.getByRole("button", { name: "Save arrangement" }));
  } else {
    await user.selectOptions(
      screen.getByLabelText("This Shoebox's timezone"),
      "Asia/Manila",
    );
    await user.click(
      screen.getByRole("button", { name: "Preview timezone change" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Confirm timezone change" }),
    );
  }
}

function _expectSavedSettingField(field: SavedField): void {
  switch (field) {
    case "name":
      expect(screen.getByLabelText("Shoebox name")).toHaveValue("Saved family");
      break;
    case "sender":
      expect(screen.getByLabelText("Sending address")).toHaveValue(
        "saved@example.com",
      );
      break;
    case "arrangement":
      expect(screen.getByRole("radio", { name: "Tidy" })).toBeChecked();
      break;
    case "timezone":
      expect(screen.getByLabelText("This Shoebox's timezone")).toHaveValue(
        "Asia/Manila",
      );
  }
}

function _expectRestoredSettingField(field: SavedField): void {
  switch (field) {
    case "name":
      expect(screen.getByLabelText("Shoebox name")).toHaveValue("My Shoebox");
      expect(
        screen.queryByRole("button", { name: "Save the new name" }),
      ).not.toBeInTheDocument();
      break;
    case "sender":
      expect(screen.getByLabelText("Sending address")).toHaveValue(
        "shoebox@example.com",
      );
      expect(
        screen.queryByRole("button", { name: "Save sending address" }),
      ).not.toBeInTheDocument();
      break;
    case "arrangement":
      expect(screen.getByRole("radio", { name: "Messy" })).toBeChecked();
      expect(
        screen.queryByRole("button", { name: "Save arrangement" }),
      ).not.toBeInTheDocument();
      break;
    case "timezone":
      expect(screen.getByLabelText("This Shoebox's timezone")).toHaveValue(
        "Europe/Madrid",
      );
      expect(
        screen.queryByRole("button", { name: "Preview timezone change" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Confirm timezone change" }),
      ).not.toBeInTheDocument();
  }
}

function _deferFreshSettingsRead(
  canonical: Readonly<typeof SETTINGS> = FRESH,
): () => void {
  const original = vi.mocked(fetch).getMockImplementation()!;
  let finish = () => {};
  const freshRead = new Promise<void>((settle) => {
    finish = settle;
  });
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (path === "/api/settings" && init?.method !== "PATCH") {
      await freshRead;
      return Response.json(canonical);
    }
    return original(path, init);
  });
  return finish;
}

async function _editAllSettings() {
  const user = userEvent.setup();
  const name = await screen.findByLabelText("Shoebox name");
  await user.clear(name);
  await user.type(name, "Deliberate name");
  const sender = screen.getByLabelText("Sending address");
  await user.clear(sender);
  await user.type(sender, "draft@example.com");
  await user.selectOptions(
    screen.getByLabelText("This Shoebox's timezone"),
    "Asia/Manila",
  );
  await user.click(screen.getByRole("radio", { name: "Tidy" }));
  return { user, name, sender };
}

import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
  renderSettings,
  SETTINGS,
  IMPACT,
  makeSavedSettingsResponseFromOverrides,
} from "./settingsFixtureHelpers";
import { deferSettingsRead } from "./deferSettingsRead";
type SavedField = (typeof SAVED_FIELDS)[number];

const SAVED_FIELDS = ["name", "sender", "arrangement", "timezone"] as const;

function _getSavedResponseFromField(
  field: SavedField,
): ReturnType<typeof makeSavedSettingsResponseFromOverrides> {
  switch (field) {
    case "name":
      return makeSavedSettingsResponseFromOverrides({
        overrides: { shoebox: { ...SETTINGS.shoebox, name: "Saved family" } },
      });
    case "sender":
      return makeSavedSettingsResponseFromOverrides({
        overrides: {
          mail: { ...SETTINGS.mail, fromAddress: "saved@example.com" },
        },
      });
    case "arrangement":
      return makeSavedSettingsResponseFromOverrides({
        overrides: { pile: { arrangement: "tidy" } },
      });
    case "timezone":
      return makeSavedSettingsResponseFromOverrides({
        overrides: {
          shoebox: { ...SETTINGS.shoebox, timezone: "Asia/Manila" },
        },
        impact: IMPACT,
      });
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

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each(SAVED_FIELDS)(
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
          body: {
            ...makeSavedSettingsResponseFromOverrides({
              overrides: {},
              impact: IMPACT,
            }),
            isPreview: true,
          },
        },
      },
    });
    await screen.findByLabelText("Shoebox name");
    // Another administrator restores A before this post-save GET completes.
    const finish = deferSettingsRead(SETTINGS);
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

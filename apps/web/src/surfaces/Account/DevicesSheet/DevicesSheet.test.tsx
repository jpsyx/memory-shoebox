import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SessionDto } from "@memory-shoebox/shared";
import { DevicesSheet } from "@/surfaces/Account/DevicesSheet/DevicesSheet";
import { cssVariablesResolver } from "@/theme/cssVariablesResolver";
import { theme } from "@/theme/theme";

const NOW = new Date("2026-09-28T12:00:00.000Z");

function _inTheme(node: ReactNode): ReactNode {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>
  );
}

const CURRENT_DEVICE: SessionDto = {
  sessionId: "018f0000-0000-7000-8000-000000000001",
  deviceLabel: "iPhone, Safari",
  createdAt: "2026-08-01T09:00:00.000Z",
  lastUsedAt: "2026-09-28T09:00:00.000Z",
  expiresAt: "2026-10-28T09:00:00.000Z",
  isCurrent: true,
};

const OTHER_DEVICE: SessionDto = {
  sessionId: "018f0000-0000-7000-8000-000000000002",
  deviceLabel: "MacBook Air, Chrome",
  createdAt: "2026-07-01T09:00:00.000Z",
  lastUsedAt: "2026-09-25T09:00:00.000Z",
  expiresAt: "2026-10-25T09:00:00.000Z",
  isCurrent: false,
};

const SECOND_OTHER_DEVICE: SessionDto = {
  sessionId: "018f0000-0000-7000-8000-000000000003",
  deviceLabel: "iPad in the kitchen, Safari",
  createdAt: "2026-06-01T09:00:00.000Z",
  lastUsedAt: "2026-09-02T09:00:00.000Z",
  expiresAt: "2026-10-02T09:00:00.000Z",
  isCurrent: false,
};

const SESSIONS: readonly SessionDto[] = [CURRENT_DEVICE, OTHER_DEVICE];

/** A controlled wrapper, since which device is mid-confirmation is caller state. */
function StatefulDevicesSheet(): ReactNode {
  const [deviceSigningOut, setDeviceSigningOut] = useState<
    SessionDto | undefined
  >(undefined);

  return (
    <DevicesSheet
      sessions={SESSIONS}
      now={NOW}
      onSignOut={setDeviceSigningOut}
      deviceSigningOut={deviceSigningOut}
      onConfirm={() => {
        setDeviceSigningOut(undefined);
      }}
      onCancel={() => {
        setDeviceSigningOut(undefined);
      }}
      isSigningOut={false}
      error={undefined}
      onRetry={undefined}
    />
  );
}

describe("the devices sheet", () => {
  it("marks the device you are holding", () => {
    render(
      _inTheme(
        <DevicesSheet
          sessions={SESSIONS}
          now={NOW}
          onSignOut={vi.fn()}
          deviceSigningOut={undefined}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          isSigningOut={false}
          error={undefined}
          onRetry={undefined}
        />,
      ),
    );

    expect(screen.getByText("· this one")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out here" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Sign out MacBook Air, Chrome" }),
    ).toBeVisible();
  });

  it("gives each non-current device's sign-out button its own accessible name", () => {
    render(
      _inTheme(
        <DevicesSheet
          sessions={[CURRENT_DEVICE, OTHER_DEVICE, SECOND_OTHER_DEVICE]}
          now={NOW}
          onSignOut={vi.fn()}
          deviceSigningOut={undefined}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          isSigningOut={false}
          error={undefined}
          onRetry={undefined}
        />,
      ),
    );

    // A single fixture with only one other device could never catch two
    // identical "Sign out" buttons: this is the case that actually matters,
    // since a real member can have several other devices signed in at once.
    expect(
      screen.getByRole("button", { name: "Sign out MacBook Air, Chrome" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Sign out iPad in the kitchen, Safari",
      }),
    ).toBeVisible();
  });

  it("is just the one row when the current device is the only one", () => {
    render(
      _inTheme(
        <DevicesSheet
          sessions={[CURRENT_DEVICE]}
          now={NOW}
          onSignOut={vi.fn()}
          deviceSigningOut={undefined}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          isSigningOut={false}
          error={undefined}
          onRetry={undefined}
        />,
      ),
    );

    expect(screen.getByText("· this one")).toBeVisible();
    expect(screen.getAllByRole("row")).toHaveLength(2); // header row + one device
    expect(screen.getByRole("button", { name: "Sign out here" })).toBeVisible();
  });

  it("offers a plainer sign-out for another device", async () => {
    const user = userEvent.setup();
    render(_inTheme(<StatefulDevicesSheet />));

    await user.click(
      screen.getByRole("button", { name: "Sign out MacBook Air, Chrome" }),
    );

    await screen.findByRole("heading", { name: "Sign this device out?" });
    expect(
      screen.getByText(
        "MacBook Air, Chrome stops working straight away. Whoever is holding it will see the sign-in page and nothing else.",
      ),
    ).toBeInTheDocument();
  });

  it("warns differently about the device you are on", async () => {
    const user = userEvent.setup();
    render(_inTheme(<StatefulDevicesSheet />));

    await user.click(screen.getByRole("button", { name: "Sign out here" }));

    await screen.findByRole("heading", { name: "Sign out of this device?" });
    expect(
      screen.getByText(
        "You are using this one. Signing out here means you will need a fresh six-digit code to get back in, on this device.",
      ),
    ).toBeInTheDocument();
  });

  it("says what a lost phone is for", () => {
    render(
      _inTheme(
        <DevicesSheet
          sessions={SESSIONS}
          now={NOW}
          onSignOut={vi.fn()}
          deviceSigningOut={undefined}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          isSigningOut={false}
          error={undefined}
          onRetry={undefined}
        />,
      ),
    );

    expect(screen.getByText(/Lost a phone, or handed one on\?/)).toBeVisible();
    expect(
      screen.getByText(/stops working immediately, wherever it is/),
    ).toBeVisible();
  });

  it("gives the table a real header row and an accessible name", () => {
    render(
      _inTheme(
        <DevicesSheet
          sessions={SESSIONS}
          now={NOW}
          onSignOut={vi.fn()}
          deviceSigningOut={undefined}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          isSigningOut={false}
          error={undefined}
          onRetry={undefined}
        />,
      ),
    );

    const table = screen.getByRole("table");
    expect(table).toHaveAccessibleName();
    expect(screen.getByRole("columnheader", { name: "Device" })).toBeVisible();
    expect(
      screen.getByRole("columnheader", { name: "Last used" }),
    ).toBeVisible();
    expect(
      screen.getByRole("columnheader", { name: "Stays until" }),
    ).toBeVisible();
  });

  // `design-spec.md` § Responsive behaviour: "the tables scroll rather than
  // reflow". Four columns pushed the whole page 153px wide at a 400px
  // viewport before this, which `PRODUCT.md` § Accessibility & Inclusion does
  // not allow. A region that scrolls has to be reachable by keyboard, so the
  // `tabIndex` is asserted rather than assumed.
  it("puts the table in a named scroll region a keyboard can reach", () => {
    render(
      _inTheme(
        <DevicesSheet
          sessions={SESSIONS}
          now={NOW}
          onSignOut={vi.fn()}
          deviceSigningOut={undefined}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          isSigningOut={false}
          error={undefined}
          onRetry={undefined}
        />,
      ),
    );

    const region = screen.getByRole("region", {
      name: "Where you are signed in",
    });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toContainElement(screen.getByRole("table"));
  });
});

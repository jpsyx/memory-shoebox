import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { MailHealthResponse } from "@memory-shoebox/shared";
import {
  HEALTH,
  renderSettings,
} from "@/surfaces/Settings/SettingsSurface/__tests__/settingsFixtureHelpers";

function _answerRecheck(response: Promise<Response>): void {
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((path, init) => {
    return path === "/api/mail/health?refresh=true"
      ? response
      : originalFetch(path, init);
  });
}

async function _waitForRecheckButton(): Promise<HTMLElement> {
  const button = await screen.findByRole("button", {
    name: "Recheck mail health",
  });
  await waitFor(() => {
    expect(button).toBeEnabled();
  });
  return button;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("announces an in-flight recheck and prevents repeated clicks until it finishes", async () => {
  renderSettings();
  const user = userEvent.setup();
  const button = await _waitForRecheckButton();
  let finishCheck = (_response: Response) => {};
  _answerRecheck(
    new Promise<Response>((settle) => {
      finishCheck = settle;
    }),
  );
  await user.click(button);
  try {
    expect(
      screen.getByRole("button", { name: "Checking mail health…" }),
    ).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("status", { name: "Mail health" }),
    ).toHaveTextContent("Checking mail health…");
    expect(screen.queryByText(/Check complete/)).not.toBeInTheDocument();
  } finally {
    await act(async () => {
      finishCheck(Response.json(HEALTH));
    });
  }
  expect(
    await screen.findByText("Check complete. No current mail problems found."),
  ).toBeVisible();
  expect(await _waitForRecheckButton()).toHaveAttribute("aria-busy", "false");
});

it("refreshes the visible completion time even when rechecks return identical health", async () => {
  const clock = vi
    .spyOn(Date, "now")
    .mockReturnValue(Date.parse("2026-10-11T15:42:18Z"));
  renderSettings();
  const user = userEvent.setup();
  const button = await _waitForRecheckButton();
  const result = screen.getByRole("status", { name: "Mail health" });
  const initialTime = result.querySelector("time");
  expect(initialTime).toHaveAttribute("datetime", "2026-10-11T15:42:18.000Z");
  const initialText = initialTime?.textContent;
  expect(initialText).toContain("5:42:18 PM");
  clock.mockReturnValue(Date.parse("2026-10-11T15:42:19Z"));
  await user.click(button);
  await waitFor(() => {
    expect(result.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-10-11T15:42:19.000Z",
    );
  });
  expect(result.querySelector("time")?.textContent).not.toBe(initialText);
  expect(result).toHaveTextContent(
    "Check complete. No current mail problems found.",
  );
  expect(result).toHaveAttribute("aria-atomic", "true");
});

it.each<MailHealthResponse["diagnosis"]>([
  { code: "base_url_unset", settingKey: "public.base_url" },
  { code: "domain_unverified", domain: "example.com", providerError: null },
  {
    code: "backlog",
    oldestQueuedAt: "2026-10-11T15:00:00.000Z",
    queuedCount: 12,
  },
])(
  "shows a completed check and actionable diagnosis beside the button for $code",
  async (diagnosis) => {
    renderSettings();
    const user = userEvent.setup();
    const button = await _waitForRecheckButton();
    _answerRecheck(
      Promise.resolve(
        Response.json({ ...HEALTH, status: "failing", diagnosis }),
      ),
    );
    await user.click(button);
    const result = screen.getByRole("status", { name: "Mail health" });
    await waitFor(() => {
      expect(result).toHaveTextContent("Check complete. Mail needs attention.");
    });
    expect(
      within(result).getByText(
        /Save the Base URL|Add the DNS records|Check the mail worker/,
      ),
    ).toBeVisible();
    expect(result.querySelector("time")).toBeVisible();
    expect(result).not.toHaveTextContent("Couldn’t check");
  },
);

it("labels retained health as previous when a recheck fails and clears the error on retry", async () => {
  renderSettings();
  const user = userEvent.setup();
  const button = await _waitForRecheckButton();
  _answerRecheck(
    Promise.resolve(
      Response.json(
        { error: "unavailable", message: "Internal details" },
        { status: 503 },
      ),
    ),
  );
  await user.click(button);
  const result = screen.getByRole("status", { name: "Mail health" });
  await waitFor(() => {
    expect(result).toHaveTextContent("Couldn’t check mail health. Try again.");
  });
  expect(result).toHaveTextContent(
    "Previous result: No current mail problems found.",
  );
  expect(result).toHaveTextContent("Last successful check at");
  expect(result).not.toHaveTextContent("Check complete");
  expect(result).not.toHaveTextContent("Internal details");
  _answerRecheck(Promise.resolve(Response.json(HEALTH)));
  await user.click(button);
  await waitFor(() => {
    expect(result).toHaveTextContent(
      "Check complete. No current mail problems found.",
    );
  });
  expect(result).not.toHaveTextContent("Previous result");
  expect(result).not.toHaveTextContent("Couldn’t check");
});

it("offers a retry after the first read fails without inventing a previous result", async () => {
  renderSettings({
    routes: {
      "GET /api/mail/health": {
        status: 503,
        body: { error: "unavailable", message: "Unavailable" },
      },
    },
  });
  const user = userEvent.setup();
  const button = await _waitForRecheckButton();
  const result = screen.getByRole("status", { name: "Mail health" });
  expect(result).toHaveTextContent("Couldn’t check mail health. Try again.");
  expect(result).not.toHaveTextContent("Previous result");
  expect(result.querySelector("time")).toBeNull();
  _answerRecheck(Promise.resolve(Response.json(HEALTH)));
  await user.click(button);
  await waitFor(() => {
    expect(result).toHaveTextContent(
      "Check complete. No current mail problems found.",
    );
  });
});

it("bypasses a cached domain diagnosis on explicit recheck", async () => {
  renderSettings({
    routes: {
      "GET /api/mail/health?refresh=true": {
        status: 200,
        body: {
          ...HEALTH,
          status: "failing",
          diagnosis: { code: "base_url_unset", settingKey: "public.base_url" },
        },
      },
    },
  });
  const button = await _waitForRecheckButton();
  await userEvent.setup().click(button);
  await waitFor(() => {
    return expect(
      screen.getByRole("status", { name: "Mail health" }),
    ).toHaveTextContent("Check complete. Mail needs attention.");
  });
});

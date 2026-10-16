import { screen, waitFor } from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import { expect, it, vi } from "vitest";

import { countCallsTo } from "@/surfaces/Account/AccountSurface/__tests__/accountSurfaceTestHelpers";

import {
  HEALTH,
  renderSettings,
} from "@/surfaces/Settings/SettingsSurface/__tests__/settingsFixtureHelpers";

import { makeDay, makeItem } from "@/surfaces/Timeline/timelineFixtureHelpers";

import { installSettingsSurfaceRecoveryTestLifecycle } from "./SettingsSurfacerecoveryTestHelpers";
installSettingsSurfaceRecoveryTestLifecycle();

it("shows a passive real photo miniature without new navigation controls", async () => {
  const OriginalObserver = window.IntersectionObserver;
  vi.stubGlobal(
    "IntersectionObserver",
    class extends OriginalObserver {
      private onEntry: IntersectionObserverCallback;
      constructor(onEntry: IntersectionObserverCallback) {
        super(onEntry);
        this.onEntry = onEntry;
      }
      override observe(target: Element): void {
        queueMicrotask(() => {
          this.onEntry(
            [
              {
                target,
                isIntersecting: true,
                intersectionRatio: 1,
              } as IntersectionObserverEntry,
            ],
            this,
          );
        });
      }
    },
  );
  renderSettings({
    routes: {
      "GET /api/timeline": {
        status: 200,
        body: {
          previousCursor: null,
          days: [
            makeDay({
              items: [
                makeItem({
                  media: { ...makeItem().media, altText: "Family picnic" },
                }),
              ],
            }),
          ],
          nextCursor: null,
          resultCount: null,
        },
      },
    },
  });
  expect(await screen.findByAltText("Family picnic")).toHaveAttribute(
    "src",
    "https://example.invalid/thumb.jpg",
  );
  expect(
    screen.getByAltText("Family picnic").closest("[inert]"),
  ).not.toBeNull();
});

it("shows global and inline safe mail diagnosis and rereads health without claiming a test send", async () => {
  renderSettings({
    routes: {
      "GET /api/mail/health": {
        status: 200,
        body: {
          ...HEALTH,
          status: "failing",
          diagnosis: {
            code: "domain_unverified",
            domain: "example.com",
            providerError: "Domain verification is unavailable.",
          },
        },
      },
    },
  });
  const user = userEvent.setup();
  await screen.findByLabelText("Shoebox name");
  expect(await screen.findByText("Mail needs attention.")).toBeVisible();
  expect(screen.getAllByText(/example.com is not verified/)).toHaveLength(2);
  expect(screen.getByText(/fresh domain check/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Recheck mail health" }));
  await waitFor(() => {
    return expect(
      countCallsTo({ method: "GET", path: "/api/mail/health?refresh=true" }),
    ).toBe(1);
  });
  expect(countCallsTo({ method: "POST", path: "/api/mail/test" })).toBe(0);
  expect(screen.queryByText(/Test sent/)).not.toBeInTheDocument();
});

it.each([
  [
    { code: "base_url_unset", settingKey: "public.base_url" },
    /Save the Base URL/,
  ],
  [
    { code: "from_address_unset", settingKey: "mail.from_address" },
    /Set a sending address/,
  ],
  [
    {
      code: "provider_rejecting",
      providerStatus: "403",
      providerMessage: "Mail provider refused the message.",
      failingSince: "2026-10-01T10:00:00.000Z",
    },
    /403/,
  ],
  [
    {
      code: "backlog",
      queuedCount: 12,
      oldestQueuedAt: "2026-10-01T10:00:00.000Z",
    },
    /12 messages/,
  ],
])("explains the real mail cause %j", async (diagnosis, expected) => {
  renderSettings({
    routes: {
      "GET /api/mail/health": {
        status: 200,
        body: { ...HEALTH, status: "failing", diagnosis },
      },
    },
  });
  await screen.findByLabelText("Shoebox name");
  expect(await screen.findAllByText(expected)).not.toHaveLength(0);
});

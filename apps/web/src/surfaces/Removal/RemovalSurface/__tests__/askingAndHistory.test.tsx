import { makeRemovalRequestFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import { getRecordedRequests } from "@/testing/fetchStubHelpers";
import { recordedUrls, renderAt, respondWith } from "@/testing/surfaceHarness";
import type { MediaRef, RemovalRequestDto } from "@memory-shoebox/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import {
  HISTORY,
  ITEM,
  MEMBER,
  OWN,
  RESPONSE,
  renderRemovalSurface,
} from "./renderRemovalSurface";
type RemovesStaleAnswerControlsWhenTheConfirmedAnswers0State = {
  created: RemovalRequestDto;
  media: MediaRef;
  current: RemovalRequestDto;
  hasCreated: boolean;
};
function _installRemovesStaleAnswerControlsWhenTheConfirmedAnswers0(): RemovesStaleAnswerControlsWhenTheConfirmedAnswers0State {
  const responseState: Pick<
    RemovesStaleAnswerControlsWhenTheConfirmedAnswers0State,
    "hasCreated"
  > = { hasCreated: false };

  const created = { ...OWN, canDecline: true, canDeleteItem: true };
  const media = {
    ...ITEM.media,
    altText: "Fresh request preview",
    thumb: {
      ...ITEM.media.thumb,
      url: "https://example.invalid/fresh.jpg?signature=new",
    },
  };
  const current = {
    ...created,
    canDecline: false,
    canDeleteItem: false,
    requestedBy: { ...MEMBER, displayName: "Fresh requester" },
    media,
  };

  respondWith({ [`GET ${HISTORY}`]: { status: 200, body: RESPONSE } });
  return Object.assign(responseState, { created, media, current });
}

it("accepts a blank reason, records the returned request, and never counts an item open", async () => {
  respondWith({
    [`GET ${HISTORY}`]: { status: 200, body: RESPONSE },
    [`POST ${HISTORY}`]: { status: 200, body: OWN },
  });
  renderAt(`/items/${ITEM.itemId}/removal`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Send the request" }),
  );
  expect(await screen.findByText("Your request was recorded.")).toBeVisible();
  expect(
    await screen.findByText("Please remove this.", { exact: true }),
  ).toBeVisible();
  expect(recordedUrls()).not.toContain(`/api/items/${ITEM.itemId}`);
});
it("gives own open history precedence even when the response says asking is allowed", async () => {
  renderRemovalSurface({ requests: [OWN], canRequestRemoval: true });
  expect(
    await screen.findByText("You have already asked about this one."),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "Send the request" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Withdraw the request" }),
  ).toBeVisible();
});
it.each(["missing", "malformed", "inaccessible"] as const)(
  "uses unavailable presentation for %s addresses",
  async (address) => {
    const itemId = address === "malformed" ? "abc" : ITEM.itemId;
    respondWith({
      [`GET /api/items/${itemId}/removal-requests`]: {
        status: 404,
        body: { error: "item_not_found", message: "Not here" },
      },
    });
    renderAt(`/items/${itemId}/removal`);
    expect(await screen.findByText("This one is not here.")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Send|Withdraw|Delete/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Back to the photo" }),
    ).toBeNull();
  },
);
it("preserves failed words and refuses a trimmed 4,001 character reason", async () => {
  respondWith({
    [`GET ${HISTORY}`]: { status: 200, body: RESPONSE },
    [`POST ${HISTORY}`]: {
      status: 400,
      body: { error: "validation_error", message: "Bad reason" },
    },
  });
  renderAt(`/items/${ITEM.itemId}/removal`);
  const input = await screen.findByRole("textbox", {
    name: "Why, if you want to say",
  });
  await userEvent.type(input, "My words");
  await userEvent.click(
    screen.getByRole("button", { name: "Send the request" }),
  );
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(input).toHaveValue("My words");
  await userEvent.clear(input);
  await userEvent.click(input);
  await userEvent.paste(` ${"x".repeat(4001)} `);
  await userEvent.click(
    screen.getByRole("button", { name: "Send the request" }),
  );
  expect(
    await screen.findByText("Use no more than 4,000 characters."),
  ).toBeVisible();
  expect(
    getRecordedRequests().filter(({ method }) => {
      return method === "POST";
    }),
  ).toHaveLength(1);
});
it("restores a surviving asking-page destination after declining removes its trigger", async () => {
  const incoming = makeRemovalRequestFromOverrides({
    canWithdraw: false,
    canDecline: true,
  });
  respondWith({
    [`GET ${HISTORY}`]: {
      status: 200,
      body: { ...RESPONSE, removalRequests: [incoming] },
    },
    [`POST /api/removal-requests/${incoming.requestId}/decline`]: {
      status: 200,
      body: {
        ...incoming,
        state: "declined",
        canDecline: false,
        declineReason: "Keeping it for now.",
      },
    },
  });
  renderAt(`/items/${ITEM.itemId}/removal`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Keep it, and say why" }),
  );
  const dialog = await screen.findByRole("dialog");
  await userEvent.type(
    within(dialog).getByRole("textbox"),
    "Keeping it for now.",
  );
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Send this and keep it" }),
  );
  expect(await screen.findByText("Keeping it for now.")).toBeVisible();
  await waitFor(() => {
    return expect(
      document.querySelector("[data-removal-page-focus]"),
    ).toHaveFocus();
  });
});
it("removes stale answer controls when the confirmed own open request loses capabilities", async () => {
  const responses0 =
    _installRemovesStaleAnswerControlsWhenTheConfirmedAnswers0();
  const originalFetch = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === HISTORY && init?.method === "POST") {
        responses0.hasCreated = true;
        return Response.json(responses0.created);
      }
      return url === HISTORY && responses0.hasCreated
        ? Response.json({
            ...RESPONSE,
            removalRequests: [responses0.current],
            canRequestRemoval: false,
          })
        : originalFetch(url, init);
    }),
  );
  renderAt(`/items/${ITEM.itemId}/removal`);
  await userEvent.click(
    await screen.findByRole("button", { name: "Send the request" }),
  );
  expect(await screen.findByText("Your request was recorded.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Delete it" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Keep it, and say why" }),
  ).toBeNull();
  expect(
    screen.getByText("Fresh requester is tagged in this one"),
  ).toBeVisible();
  expect(
    screen.getByRole("img", { name: "Fresh request preview" }),
  ).toHaveAttribute("src", responses0.media.thumb.url);
});

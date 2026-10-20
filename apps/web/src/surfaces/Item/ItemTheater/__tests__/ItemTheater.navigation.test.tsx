import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeBurstDetail,
  makeComment,
  TAG_HOSPITAL_ID,
} from "@/testing/itemFixtureHelpers";
import { getRecordedRequests } from "@/testing/fetchStubHelpers";
import { renderItem, recordedUrls } from "@/testing/itemHarnessHelpers";
import type { Answer } from "@/testing/surfaceHarnessHelpers";
import {
  FIRST,
  LAST,
  MIDDLE,
  respondWithNavigationItems,
  waitForNavigationReady,
} from "../../ItemViewer/ItemNavigation/__tests__/ItemNavigationTestHelpers";

async function enterTheater(): Promise<HTMLElement> {
  await userEvent.click(
    await screen.findByRole("button", { name: "Enter theater" }),
  );
  return screen.getByRole("dialog", { name: "Media theater" });
}
function positionRequests(): ReturnType<typeof getRecordedRequests> {
  return getRecordedRequests().filter((request) => {
    return request.url === "/api/media/position";
  });
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Object.defineProperty(HTMLMediaElement.prototype, "audioTracks", {
    configurable: true,
    get: () => {
      return new EventTarget();
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLMediaElement.prototype, "audioTracks");
});

describe("persistent media theater", () => {
  it("keeps one host through photo/photo/video navigation and Back keeps the current route and composer", async () => {
    respondWithNavigationItems({
      order: [FIRST, LAST, MIDDLE],
      routes: {
        "POST /api/media/position": {
          status: 200,
          body: { position: 1, total: 3 },
        },
        [`GET /api/items/${MIDDLE.itemId}/video-reactions`]: {
          status: 200,
          body: [],
        },
      },
    });
    const { router, container } = renderItem(FIRST.itemId);
    await waitForNavigationReady();
    expect(positionRequests()).toHaveLength(0);
    const originalComposer = screen.getByRole("textbox", {
      name: "Write a comment",
    });
    const originalHost = container.querySelector("[data-item-theater-host]");
    const theater = await enterTheater();
    expect(theater).toBe(originalHost);
    expect(originalComposer).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Comment on this photo" }),
    );
    expect(screen.getByRole("textbox", { name: "Write a comment" })).toBe(
      originalComposer,
    );
    await userEvent.type(originalComposer, "Photo draft");
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{ArrowRight}");
    await waitForNavigationReady();
    expect(router.state.location.pathname).toBe(`/items/${LAST.itemId}`);
    await userEvent.keyboard("{ArrowRight}");
    await screen.findByLabelText("Video player");
    await waitFor(() => {
      return expect(router.state.location.pathname).toBe(
        `/items/${MIDDLE.itemId}`,
      );
    });
    expect(screen.getByRole("dialog", { name: "Media theater" })).toBe(
      originalHost,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Comment on this moment" }),
    );
    const videoComposer = screen.getByRole("textbox", {
      name: "Write a comment",
    });
    const video = container.querySelector("video")!;
    const pause = vi.spyOn(video, "pause");
    await userEvent.type(videoComposer, "Video draft");
    pause.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(pause).toHaveBeenCalled();
    expect(router.state.location.pathname).toBe(`/items/${MIDDLE.itemId}`);
    expect(screen.getByRole("textbox", { name: "Write a comment" })).toBe(
      videoComposer,
    );
    expect(videoComposer).toHaveValue("Video draft");
    expect(container.querySelector("video")).toBe(video);
    expect(screen.getByRole("button", { name: "Enter theater" })).toHaveFocus();
    await enterTheater();
    expect(screen.getByRole("dialog", { name: "Media theater" })).toBe(
      originalHost,
    );
    expect(
      recordedUrls().filter((url) => {
        return url === `/api/items/${MIDDLE.itemId}`;
      }),
    ).toHaveLength(1);
  });

  it("omits prior counters and waits for the selected actual detail before requesting a position", async () => {
    let release = () => {};
    const answer: Answer = {
      status: 200,
      body: MIDDLE,
      waitFor: new Promise<void>((done) => {
        release = done;
      }),
    };
    respondWithNavigationItems({
      routes: {
        [`GET /api/items/${MIDDLE.itemId}`]: answer,
        "POST /api/media/position": {
          status: 200,
          body: { position: 1, total: 3 },
        },
        [`GET /api/items/${MIDDLE.itemId}/video-reactions`]: {
          status: 200,
          body: [],
        },
      },
    });
    const { router } = renderItem(FIRST.itemId);
    await waitForNavigationReady();
    await enterTheater();
    await screen.findByText(/1\/3/);
    await userEvent.click(
      screen.getByRole("button", { name: "Next photo or video" }),
    );
    await waitFor(() => {
      return expect(router.state.location.pathname).toBe(
        `/items/${MIDDLE.itemId}`,
      );
    });
    expect(
      positionRequests().map((request) => {
        return (request.body as { itemId: string }).itemId;
      }),
    ).toEqual([FIRST.itemId]);
    expect(screen.queryByText(/1\/3/)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    await act(async () => {
      release();
    });
    await screen.findByLabelText("Video player");
    await waitFor(() => {
      return expect(positionRequests()).toHaveLength(2);
    });
    expect((positionRequests()[1]!.body as { itemId: string }).itemId).toBe(
      MIDDLE.itemId,
    );
  });

  it.each([403, 404])(
    "retains Back and the host after detail denial %s, then exits safely",
    async (status) => {
      respondWithNavigationItems({
        routes: {
          [`GET /api/items/${MIDDLE.itemId}`]: {
            status,
            body: { error: "not_found", message: "Not here" },
          },
        },
      });
      const { router, container } = renderItem(FIRST.itemId);
      await waitForNavigationReady();
      const host = await enterTheater();
      await userEvent.click(
        screen.getByRole("button", { name: "Next photo or video" }),
      );
      await waitFor(() => {
        return expect(router.state.location.pathname).toBe(
          `/items/${MIDDLE.itemId}`,
        );
      });
      await screen.findByRole("heading", {
        name:
          status === 403 ? "This one did not open." : "This one is not here.",
      });
      expect(screen.getByRole("dialog", { name: "Media theater" })).toBe(host);
      expect(container.querySelector("video")).toBeNull();
      expect(container.querySelector("textarea")).toBeNull();
      expect(positionRequests()).toHaveLength(1);
      await userEvent.click(screen.getByRole("button", { name: "Back" }));
      expect(
        screen.queryByRole("dialog", { name: "Media theater" }),
      ).toBeNull();
      expect(document.body.style.overflow).toBe("");
    },
  );

  it("keeps the host on failure and retry, and releases scroll/focus ownership when the route unmounts", async () => {
    const answer: Answer = {
      status: 500,
      body: { error: "internal", message: "Failed" },
    };
    respondWithNavigationItems({
      routes: { [`GET /api/items/${MIDDLE.itemId}`]: answer },
    });
    const { router } = renderItem(FIRST.itemId);
    await waitForNavigationReady();
    const host = await enterTheater();
    await userEvent.click(
      screen.getByRole("button", { name: "Next photo or video" }),
    );
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByRole("dialog", { name: "Media theater" })).toBe(host);
    answer.status = 200;
    answer.body = MIDDLE;
    await userEvent.click(retry);
    await screen.findByLabelText("Video player");
    expect(screen.getByRole("dialog", { name: "Media theater" })).toBe(host);
    await act(async () => {
      await router.navigate({ to: "/" });
    });
    expect(screen.queryByRole("dialog", { name: "Media theater" })).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.querySelector("[data-item-theater-host]")).toBeNull();
  });

  it("carries the originating filters through burst steps and position reads while serializing rapid keys", async () => {
    const first = makeBurstDetail({ position: 1, frameCount: 2 });
    const second = makeBurstDetail({ position: 2, frameCount: 2 });
    respondWithNavigationItems({
      order: [first, second, LAST],
      routes: {
        [`GET /api/items/${first.itemId}`]: { status: 200, body: first },
        [`GET /api/items/${second.itemId}`]: { status: 200, body: second },
        "POST /api/media/preview": {
          status: 200,
          body: {
            items: [first, second, LAST].map((item) => {
              return {
                itemId: item.itemId,
                kind: item.kind,
                width: item.media.width,
                height: item.media.height,
                media: item.media,
              };
            }),
          },
        },
        "POST /api/media/position": {
          status: 200,
          body: { position: 2, total: 3 },
        },
      },
    });
    const { router } = renderItem(first.itemId);
    await waitForNavigationReady();
    const selection = {
      tags: [TAG_HOSPITAL_ID],
      people: [],
      from: "2026-09-01",
      until: "2026-09-30",
    };
    await act(async () => {
      await router.navigate({
        to: "/items/$itemId",
        params: { itemId: first.itemId },
        replace: true,
        state: (state) => {
          return { ...state, itemNavigationSelection: selection };
        },
      });
    });
    await waitForNavigationReady();
    const theater = await enterTheater();
    for (let index = 0; index < 4; index++) {
      fireEvent.keyDown(theater, { key: "ArrowRight" });
    }
    await waitForNavigationReady();
    expect(router.state.location.pathname).toBe(`/items/${second.itemId}`);
    expect(router.state.location.state.itemNavigationSelection).toEqual(
      selection,
    );
    await waitFor(() => {
      return expect(positionRequests()).toHaveLength(2);
    });
    expect(
      positionRequests().map((request) => {
        return request.body;
      }),
    ).toEqual([
      { itemId: first.itemId, selection },
      { itemId: second.itemId, selection },
    ]);
    fireEvent.keyDown(theater, { key: "ArrowRight" });
    await waitFor(() => {
      return expect(router.state.location.pathname).toBe(
        `/items/${LAST.itemId}`,
      );
    });
    expect(screen.getByRole("dialog", { name: "Media theater" })).toBe(theater);
  });

  it("keeps a real nested comment dialog inside theater and layers Escape before dock dismissal", async () => {
    respondWithNavigationItems({
      routes: {
        [`GET /api/items/${FIRST.itemId}`]: {
          status: 200,
          body: {
            ...FIRST,
            comments: [makeComment({ canEdit: true, canDelete: true })],
          },
        },
      },
    });
    const { router } = renderItem(FIRST.itemId);
    await waitForNavigationReady();
    const theater = await enterTheater();
    await userEvent.click(
      screen.getByRole("button", { name: "Comment on this photo" }),
    );
    expect(
      screen.getByRole("textbox", { name: "Write a comment" }),
    ).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Delete what you wrote?",
    });
    expect(theater).toContainElement(dialog);
    await userEvent.keyboard("{ArrowRight}{Escape}");
    await waitFor(() => {
      return expect(
        screen.queryByRole("dialog", { name: "Delete what you wrote?" }),
      ).toBeNull();
    });
    expect(router.state.location.pathname).toBe(`/items/${FIRST.itemId}`);
    expect(
      screen.getByRole("textbox", { name: "Write a comment" }),
    ).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Media theater" })).toBe(theater);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Media theater" })).toBe(theater);
  });

  it("closes the dock before window theater on Escape and keeps typing arrows in the composer", async () => {
    respondWithNavigationItems();
    const { router } = renderItem(FIRST.itemId);
    await waitForNavigationReady();
    const theater = await enterTheater();
    await userEvent.click(
      within(theater).getByRole("button", {
        name: "Open comments, 0 comments",
      }),
    );
    const field = screen.getByRole("textbox", { name: "Write a comment" });
    await userEvent.type(field, "hello{ArrowLeft}{ArrowRight}");
    expect(router.state.location.pathname).toBe(`/items/${FIRST.itemId}`);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Media theater" })).toBe(theater);
    expect(
      screen.getByRole("button", { name: "Open comments, 0 comments" }),
    ).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Media theater" })).toBeNull();
  });
});

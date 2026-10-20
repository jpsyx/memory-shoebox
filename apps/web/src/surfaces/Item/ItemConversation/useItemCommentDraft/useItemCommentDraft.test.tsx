import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ItemCommentDraftProvider } from "../ItemCommentDraftProvider/ItemCommentDraftProvider";
import { useItemCommentDraft } from "./useItemCommentDraft";
import { useVideoTransport } from "../../ItemViewer/useVideoTransport";
import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import { ITEM_ID, makeComment, SIGNED_IN } from "@/testing/itemFixtureHelpers";
import {
  makeHold,
  makeQueryClientFromItemDetail,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";

const OTHER_ITEM_ID = "00000000-0000-4000-8000-000000000002";
const COMMENT_POST = `POST /api/items/${ITEM_ID}/comments`;
type Draft = ReturnType<typeof useItemCommentDraft>;
type Props = {
  itemId: string;
  isVideo: boolean;
  onDraft: (draft: Draft) => void;
};

function Probe({ itemId, isVideo, onDraft }: Readonly<Props>): ReactNode {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const transport = useVideoTransport(itemId);
  const draft = useItemCommentDraft({
    itemId,
    fieldRef,
    transport: isVideo ? transport : undefined,
  });
  onDraft(draft);
  return (
    <form>
      <textarea
        aria-label="Draft"
        ref={fieldRef}
        value={draft.body}
        onFocus={draft.start}
        onChange={(event) => {
          return draft.setBody(event.currentTarget.value);
        }}
      />
      <button
        type="button"
        onClick={() => {
          return transport.setPosition(6.25);
        }}
      >
        Seek 6.25
      </button>
      <button
        type="button"
        onClick={() => {
          return transport.setPosition(0.99);
        }}
      >
        Seek 0.99
      </button>
      <button
        type="button"
        onClick={() => {
          return transport.setPosition(12.5);
        }}
      >
        Seek 12.5
      </button>
      <button
        type="button"
        onClick={() => {
          return transport.setPosition(0);
        }}
      >
        Seek 0
      </button>
      <button type="button" onClick={draft.toggleMoment}>
        ×
      </button>
    </form>
  );
}

function renderDraft(isVideo = true): {
  readDraft: () => Draft;
  show: (itemId?: string, hasComposer?: boolean, lifetime?: string) => void;
  queryClient: ReturnType<typeof makeQueryClientFromItemDetail>;
} {
  const queryClient = makeQueryClientFromItemDetail();
  let draft: Draft;
  const tree = (itemId = ITEM_ID, hasComposer = true, lifetime = "visit") => {
    return (
      <QueryClientProvider client={queryClient}>
        <ItemCommentDraftProvider key={lifetime}>
          {hasComposer ? (
            <Probe
              key={itemId}
              itemId={itemId}
              isVideo={isVideo}
              onDraft={(value) => {
                draft = value;
              }}
            />
          ) : null}
        </ItemCommentDraftProvider>
      </QueryClientProvider>
    );
  };
  const view = render(tree());
  return {
    readDraft: () => {
      return draft;
    },
    show: (itemId, hasComposer, lifetime) => {
      return view.rerender(tree(itemId, hasComposer, lifetime));
    },
    queryClient,
  };
}

function writeWords(words: string): void {
  fireEvent.focus(screen.getByRole("textbox", { name: "Draft" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Draft" }), {
    target: { value: words },
  });
}

function preparePost(status = 201): ReturnType<typeof makeHold> {
  const pending = makeHold();
  stubFetch({
    [COMMENT_POST]: {
      status,
      body:
        status === 201
          ? makeComment({ author: SIGNED_IN, body: "Sent words" })
          : { error: "server_error", message: "Try again." },
      waitFor: pending.hold,
    },
  });
  return pending;
}

afterEach(() => {
  return vi.unstubAllGlobals();
});

describe("shared comment drafts", () => {
  it.each([false, true])(
    "retains a %s video draft through composer unmount and item changes",
    (isVideo) => {
      const view = renderDraft(isVideo);
      fireEvent.click(screen.getByRole("button", { name: "Seek 6.25" }));
      writeWords("First memory");
      view.show(ITEM_ID, false);
      view.show();
      expect(view.readDraft().body).toBe("First memory");
      expect(view.readDraft().atSeconds).toBe(isVideo ? 6.25 : undefined);
      view.show(OTHER_ITEM_ID);
      writeWords("Other memory");
      view.show();
      expect(view.readDraft().body).toBe("First memory");
      expect(view.readDraft().atSeconds).toBe(isVideo ? 6.25 : undefined);
      view.show(OTHER_ITEM_ID);
      expect(view.readDraft().body).toBe("Other memory");
    },
  );

  it.each(["Seek 0", "Seek 0.99", "×"])(
    "posts Whole video after %s",
    async (action) => {
      const pending = preparePost();
      const view = renderDraft();
      fireEvent.click(
        screen.getByRole("button", {
          name: action === "×" ? "Seek 6.25" : action,
        }),
      );
      writeWords("Sent words");
      if (action === "×") {
        fireEvent.click(screen.getByRole("button", { name: "×" }));
      }
      act(() => {
        return view.readDraft().submit();
      });
      await waitFor(() => {
        return expect(getRecordedRequests()).toHaveLength(1);
      });
      expect(getRecordedRequests()[0]?.body).toEqual({
        body: "Sent words",
        atSeconds: null,
      });
      await act(async () => {
        return pending.letGo();
      });
      await waitForWritesToSettle(view.queryClient);
    },
  );

  it.each([201, 500])(
    "preserves newer words and other items across pending unmount, re-entry and status %s",
    async (status) => {
      const pending = preparePost(status);
      const view = renderDraft();
      fireEvent.click(screen.getByRole("button", { name: "Seek 6.25" }));
      writeWords("Sent words");
      act(() => {
        return view.readDraft().submit();
      });
      view.show(OTHER_ITEM_ID);
      writeWords("Other memory");
      view.show();
      expect(view.readDraft().isSending).toBe(true);
      writeWords("Newer words");
      act(() => {
        return view.readDraft().submit();
      });
      view.show(OTHER_ITEM_ID);
      await act(async () => {
        return pending.letGo();
      });
      await waitForWritesToSettle(view.queryClient);
      expect(
        getRecordedRequests().filter((request) => {
          return request.method === "POST";
        }),
      ).toHaveLength(1);
      expect(view.readDraft().body).toBe("Other memory");
      view.show();
      expect(view.readDraft().body).toBe("Newer words");
      expect(view.readDraft().atSeconds).toBe(6.25);
    },
  );

  it("clears an unchanged sent draft while unmounted and captures a new moment", async () => {
    const pending = preparePost();
    const view = renderDraft();
    fireEvent.click(screen.getByRole("button", { name: "Seek 6.25" }));
    writeWords("Sent words");
    act(() => {
      return view.readDraft().submit();
    });
    view.show(ITEM_ID, false);
    await act(async () => {
      return pending.letGo();
    });
    await waitForWritesToSettle(view.queryClient);
    view.show();
    expect(view.readDraft().body).toBe("");
    expect(view.readDraft().atSeconds).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Seek 12.5" }));
    writeWords("A fresh draft");
    expect(view.readDraft().atSeconds).toBe(12.5);
    expect(view.readDraft().body).toBe("A fresh draft");
  });

  it("retains an unchanged failed draft and allows retry after re-entry", async () => {
    const pending = preparePost(500);
    const view = renderDraft();
    fireEvent.click(screen.getByRole("button", { name: "Seek 6.25" }));
    writeWords("Sent words");
    act(() => {
      return view.readDraft().submit();
    });
    view.show(ITEM_ID, false);
    await act(async () => {
      return pending.letGo();
    });
    await waitForWritesToSettle(view.queryClient);
    view.show();
    expect(view.readDraft().body).toBe("Sent words");
    expect(view.readDraft().atSeconds).toBe(6.25);
    expect(view.readDraft().isSending).toBe(false);
    stubFetch({
      [COMMENT_POST]: {
        status: 201,
        body: makeComment({
          author: SIGNED_IN,
          body: "Sent words",
          atSeconds: 6.25,
        }),
      },
    });
    act(() => {
      return view.readDraft().submit();
    });
    await waitForWritesToSettle(view.queryClient);
    await waitFor(() => {
      return expect(view.readDraft().body).toBe("");
    });
  });

  it("preserves an edit away and back to the sent body as a newer revision", async () => {
    const pending = preparePost();
    const view = renderDraft();
    writeWords("Sent words");
    act(() => {
      return view.readDraft().submit();
    });
    writeWords("Changed");
    writeWords("Sent words");
    await act(async () => {
      return pending.letGo();
    });
    await waitForWritesToSettle(view.queryClient);
    expect(view.readDraft().body).toBe("Sent words");
  });

  it("discards memory on provider teardown and ignores old pending success", async () => {
    const pending = preparePost();
    const view = renderDraft();
    writeWords("Sent words");
    act(() => {
      return view.readDraft().submit();
    });
    view.show(ITEM_ID, false, "denied");
    view.show(ITEM_ID, true, "new-member");
    expect(view.readDraft().body).toBe("");
    writeWords("New member words");
    await act(async () => {
      return pending.letGo();
    });
    await waitForWritesToSettle(view.queryClient);
    expect(view.readDraft().body).toBe("New member words");
  });
});

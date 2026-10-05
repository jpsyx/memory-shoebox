import { getRecordedRequests } from "@/testing/fetchStubHelpers";
import { act, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  detail,
  first,
  installCandidateAnswers,
  makeTimelinePageFromItems,
  renderAttachmentController,
  second,
  VIEWER,
} from "./attachmentTestHelpers";
function _installLateOldFilterAnswersCannotReplaceTheFetch0(): {
  releaseOld: (() => void) | undefined;
  held: Promise<void>;
} {
  const responseState: Pick<
    { releaseOld: (() => void) | undefined; held: Promise<void> },
    "releaseOld"
  > = { releaseOld: undefined };

  const held = new Promise<void>((settle) => {
    responseState.releaseOld = settle;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const query = new URL(url, "http://localhost").searchParams;
      if (query.get("tags") === "old") {
        await held;
      }
      return new Response(
        JSON.stringify(
          makeTimelinePageFromItems({
            items: query.get("tags") === "old" ? [first] : [second],
          }),
        ),
      );
    }),
  );
  return Object.assign(responseState, { held });
}

function _installVerifiesTheOriginalPendingIdentityWhenAFetch1(): {
  patches: unknown[];
} {
  const patches: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const candidateBody = url.includes("candidates")
        ? {
            candidates: [
              {
                item: second,
                isAttached: url.includes("scope=all"),
                isOutsideSpan: false,
              },
            ],
            nextCursor: null,
          }
        : detail;
      if (init?.method === "PATCH") {
        patches.push(JSON.parse(String(init.body)));
      }
      const body =
        init?.method === "PATCH"
          ? patches.length === 1
            ? {}
            : { ...detail, attachedCount: 0, detachedCount: 1 }
          : candidateBody;
      return new Response(JSON.stringify(body));
    }),
  );
  return { patches };
}

function _installPermissionRefusalKeepsChoicesRefreshedCanEditBlocksFetch2(): {
  canEdit: boolean;
} {
  const responseState: { canEdit: boolean } = { canEdit: true };

  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      return init?.method === "PATCH"
        ? new Response(
            JSON.stringify({ error: "forbidden", message: "No permission" }),
            { status: 403 },
          )
        : url === `/api/milestones/${detail.milestone.milestoneId}`
          ? new Response(
              JSON.stringify({ ...detail, canEdit: responseState.canEdit }),
            )
          : original(url, init);
    }),
  );
  return responseState;
}

it("late old filter answers cannot replace the current results or choices", async () => {
  const responses0 = _installLateOldFilterAnswersCannotReplaceTheFetch0();
  const { result } = renderAttachmentController("archive");
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(1);
  });
  act(() => {
    result.current.toggle(second.itemId);
    result.current.onSelectionChange({
      tags: ["old"],
      people: [],
      from: undefined,
      until: undefined,
    });
  });
  await waitFor(() => {
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => {
        return String(url).includes("tags=old");
      }),
    ).toBe(true);
  });
  act(() => {
    result.current.onSelectionChange({
      tags: ["new"],
      people: [],
      from: undefined,
      until: undefined,
    });
  });
  await waitFor(() => {
    expect(result.current.entries[0]?.item.itemId).toBe(second.itemId);
  });
  responses0.releaseOld?.();
  await act(async () => {
    await responses0.held;
  });
  expect(result.current.entries).toMatchObject([
    { item: { itemId: second.itemId }, isAttached: true },
  ]);
  expect(result.current.attachCount).toBe(1);
});
it("verifies the original pending identity when a later toggle cancels the old delta", async () => {
  const responses1 = _installVerifiesTheOriginalPendingIdentityWhenAFetch1();
  const { result } = renderAttachmentController();
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(1);
  });
  act(() => {
    result.current.toggle(second.itemId);
  });
  act(() => {
    result.current.save();
  });
  await waitFor(() => {
    expect(result.current.error).toBeDefined();
  });
  act(() => {
    result.current.toggle(second.itemId);
  });
  expect(result.current.attachCount).toBe(0);
  act(() => {
    result.current.save();
  });
  await waitFor(() => {
    expect(result.current.savedDetail).toBeDefined();
  });
  expect(responses1.patches).toEqual([
    { attach: [second.itemId], detach: [] },
    { attach: [], detach: [second.itemId] },
  ]);
});
it("permission refusal keeps choices; refreshed canEdit blocks retry", async () => {
  installCandidateAnswers();
  const responses2 =
    _installPermissionRefusalKeepsChoicesRefreshedCanEditBlocksFetch2();
  const { result } = renderAttachmentController();
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(2);
  });
  act(() => {
    result.current.toggle(second.itemId);
  });
  act(() => {
    result.current.save();
  });
  await waitFor(() => {
    expect(result.current.error).toBeDefined();
  });
  expect(result.current.attachCount).toBe(1);
  responses2.canEdit = false;
  const attempts = vi.mocked(fetch).mock.calls.filter(([, init]) => {
    return init?.method === "PATCH";
  }).length;
  act(() => {
    result.current.save();
  });
  await waitFor(() => {
    expect(result.current.isPending).toBe(false);
  });
  expect(
    vi.mocked(fetch).mock.calls.filter(([, init]) => {
      return init?.method === "PATCH";
    }),
  ).toHaveLength(attempts);
});
it("a pending old member operation cannot write after authority responds", async () => {
  installCandidateAnswers();
  const { result, rerender } = renderAttachmentController();
  await waitFor(() => {
    expect(result.current.entries).toHaveLength(2);
  });
  let release: (() => void) | undefined;
  const held = new Promise<void>((settle) => {
    release = settle;
  });
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `/api/milestones/${detail.milestone.milestoneId}`) {
        await held;
      }
      return original(url, init);
    }),
  );
  act(() => {
    result.current.toggle(second.itemId);
  });
  act(() => {
    result.current.save();
  });
  rerender({
    detail,
    viewer: { ...VIEWER, memberId: "member-two" },
    source: "span",
    hasUsableAuthority: true,
  });
  release?.();
  await waitFor(() => {
    expect(result.current.isPending).toBe(false);
  });
  expect(
    getRecordedRequests().some((request) => {
      return request.method === "PATCH";
    }),
  ).toBe(false);
  expect(result.current.savedDetail).toBeUndefined();
});

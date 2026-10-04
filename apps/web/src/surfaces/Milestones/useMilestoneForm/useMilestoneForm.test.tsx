import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { stubFetch, getRecordedRequests } from "@/testing/fetchStubHelpers";
import {
  makeItemSummaryFromOverrides,
  makeMilestoneDetailFromOverrides,
} from "@/testing/askingAndOccasionsFixtures";
import { useMilestoneForm } from "./useMilestoneForm";
const detail = makeMilestoneDetailFromOverrides();
function _render(
  options: Parameters<typeof useMilestoneForm>[0] = {
    onSaved: vi.fn(),
    onCancel: vi.fn(),
  },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
  const harness = renderHook(
    (props: Parameters<typeof useMilestoneForm>[0]) => {
      return useMilestoneForm(props);
    },
    { initialProps: options, wrapper },
  );
  return { ...harness, queryClient };
}
function _fill(result: ReturnType<typeof _render>["result"], name = "Home") {
  act(() => {
    result.current.setName(name);
    result.current.setSpan({
      startsOn: "2026-09-17",
      endsOn: null,
      isMultiDay: false,
    });
  });
}
describe("occasion form controller", () => {
  it("collapses a day, blank blurb is null, and accepts a 200-character name", async () => {
    stubFetch({ "POST /api/milestones": { body: detail, status: 201 } });
    const { result } = _render();
    _fill(result, "a".repeat(200));
    act(() => {
      return result.current.onSubmit();
    });
    await waitFor(() => {
      return expect(getRecordedRequests()).toHaveLength(1);
    });
    expect(getRecordedRequests()[0]?.body).toMatchObject({
      name: "a".repeat(200),
      startsOn: "2026-09-17",
      endsOn: "2026-09-17",
      blurb: null,
    });
    expect(getRecordedRequests()[0]?.body).not.toHaveProperty("itemIds");
  });
  it("rejects a reversed span before a write", () => {
    stubFetch({});
    const { result } = _render();
    _fill(result);
    act(() => {
      return result.current.setSpan({
        startsOn: "2026-09-17",
        endsOn: "2026-09-14",
        isMultiDay: true,
      });
    });
    act(() => {
      return result.current.onSubmit();
    });
    expect(getRecordedRequests()).toHaveLength(0);
    expect(result.current.error).toBeDefined();
  });
  it("prefills explicit selected capture days once and sends only explicit IDs", async () => {
    stubFetch({ "POST /api/milestones": { body: detail, status: 201 } });
    const item = makeItemSummaryFromOverrides({ capturedOn: "2026-09-17" });
    const options = { selection: [item], onSaved: vi.fn(), onCancel: vi.fn() };
    const { result, rerender } = _render(options);
    expect(result.current.span.startsOn).toBe("2026-09-17");
    act(() => {
      result.current.setName("Home");
      result.current.setSpan({
        startsOn: "2026-09-18",
        endsOn: null,
        isMultiDay: false,
      });
    });
    rerender({
      ...options,
      selection: [{ ...item, capturedOn: "2026-09-19" }],
    });
    expect(result.current.span.startsOn).toBe("2026-09-18");
    act(() => {
      return result.current.onSubmit();
    });
    await waitFor(() => {
      return expect(getRecordedRequests()).toHaveLength(1);
    });
    expect(getRecordedRequests()[0]?.body).toMatchObject({
      itemIds: [item.itemId],
      startsOn: "2026-09-18",
    });
  });
  it("retains refused words and permits explicit retry", async () => {
    stubFetch({
      "POST /api/milestones": {
        body: { error: "validation_error", message: "refused" },
        status: 400,
      },
    });
    const { result } = _render();
    _fill(result);
    act(() => {
      return result.current.setBlurb("Words kept");
    });
    act(() => {
      return result.current.onSubmit();
    });
    await waitFor(() => {
      return expect(result.current.error).toBeDefined();
    });
    expect(result.current.name).toBe("Home");
    expect(result.current.blurb).toBe("Words kept");
    expect(result.current.isUncertain).toBe(false);
  });
  it("blocks rapid duplicate submissions", async () => {
    let finish: (() => void) | undefined;
    const waitForResponse = new Promise<void>((r) => {
      finish = r;
    });
    stubFetch({
      "POST /api/milestones": {
        body: detail,
        status: 201,
        waitFor: waitForResponse,
      },
    });
    const { result } = _render();
    _fill(result);
    act(() => {
      result.current.onSubmit();
      result.current.onSubmit();
    });
    await waitFor(() => {
      return expect(getRecordedRequests()).toHaveLength(1);
    });
    finish?.();
    await waitFor(() => {
      return expect(result.current.isSaving).toBe(false);
    });
  });
  it.each(["transport", "schema"])(
    "never re-creates after an uncertain %s response",
    async (failure) => {
      stubFetch({
        "POST /api/milestones": { body: { invalid: true }, status: 201 },
      });
      if (failure === "transport") {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockRejectedValue(new TypeError("offline")),
        );
      }
      const onSaved = vi.fn();
      const { result } = _render({ onSaved, onCancel: vi.fn() });
      _fill(result);
      act(() => {
        return result.current.onSubmit();
      });
      await waitFor(() => {
        return expect(result.current.isUncertain).toBe(true);
      });
      act(() => {
        return result.current.onSubmit();
      });
      expect(onSaved).not.toHaveBeenCalled();
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
      expect(result.current.name).toBe("Home");
    },
  );
  it("sends edits only to PATCH and reports confirmed mismatches", async () => {
    const saved = { ...detail, mismatchCount: 2 };
    stubFetch({
      [`PATCH /api/milestones/${detail.milestone.milestoneId}`]: {
        body: saved,
        status: 200,
      },
    });
    const onSaved = vi.fn();
    const { result } = _render({ detail, onSaved, onCancel: vi.fn() });
    act(() => {
      return result.current.onSubmit();
    });
    await waitFor(() => {
      return expect(onSaved).toHaveBeenCalledWith(saved);
    });
    expect(
      getRecordedRequests().map((request) => {
        return request.method;
      }),
    ).toEqual(["PATCH"]);
  });
});

describe("occasion prefill and mutation lifetime", () => {
  it("prefills the inclusive selected span and refuses an unfinished end", () => {
    stubFetch({});
    const first = makeItemSummaryFromOverrides({ capturedOn: "2026-09-17" });
    const last = makeItemSummaryFromOverrides({
      itemId: "018f0000-0000-7000-8000-00000000f002",
      capturedOn: "2026-09-21",
    });
    const { result } = _render({
      selection: [last, first],
      onSaved: vi.fn(),
      onCancel: vi.fn(),
    });
    expect(result.current.span).toEqual({
      startsOn: "2026-09-17",
      endsOn: "2026-09-21",
      isMultiDay: true,
    });
    act(() => {
      result.current.setName("Home");
      result.current.setSpan({ ...result.current.span, endsOn: null });
    });
    act(() => {
      result.current.onSubmit();
    });
    expect(getRecordedRequests()).toHaveLength(0);
    expect(result.current.error).toBeDefined();
  });
  it("a delayed create cannot announce success after its member/form unmounts", async () => {
    let finish: (() => void) | undefined;
    const reply = new Promise<void>((settle) => {
      finish = settle;
    });
    stubFetch({
      "POST /api/milestones": { body: detail, status: 201, waitFor: reply },
    });
    const onSaved = vi.fn();
    const { result, unmount, queryClient } = _render({
      onSaved,
      onCancel: vi.fn(),
    });
    _fill(result);
    act(() => {
      result.current.onSubmit();
    });
    await waitFor(() => {
      expect(getRecordedRequests()).toHaveLength(1);
    });
    unmount();
    finish?.();
    await waitFor(() => {
      expect(queryClient.getMutationCache().getAll()[0]?.state.status).toBe(
        "success",
      );
    });
    expect(onSaved).not.toHaveBeenCalled();
    queryClient.clear();
  });
});

describe("I1: form save settlement", () => {
  it("reports a known save before a held archive refresh completes", async () => {
    stubFetch({
      [`PATCH /api/milestones/${detail.milestone.milestoneId}`]: {
        body: detail,
        status: 200,
      },
    });
    const onSaved = vi.fn();
    const { result, queryClient } = _render({
      detail,
      onSaved,
      onCancel: vi.fn(),
    });
    let finishRefresh: (() => void) | undefined;
    const refreshing = new Promise<void>((finish) => {
      finishRefresh = finish;
    });
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockImplementation(async () => {
        await refreshing;
      });
    act(() => {
      result.current.onSubmit();
    });
    try {
      await waitFor(() => {
        expect(invalidate).toHaveBeenCalled();
      });
      expect(onSaved).toHaveBeenCalledWith(detail);
    } finally {
      finishRefresh?.();
    }
    await waitFor(() => {
      expect(result.current.isSaving).toBe(false);
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

describe("I1: unusable current edit authority", () => {
  it("blocks direct submission until current authority is restored without resetting words", async () => {
    stubFetch({
      [`PATCH /api/milestones/${detail.milestone.milestoneId}`]: {
        body: detail,
        status: 200,
      },
    });
    const options = {
      detail,
      onSaved: vi.fn(),
      onCancel: vi.fn(),
      hasUsableAuthority: false,
    };
    const { result, rerender } = _render(options);
    act(() => {
      result.current.setName("Retained edit");
      result.current.onSubmit();
    });
    expect(getRecordedRequests()).toHaveLength(0);
    expect(result.current.error).toMatch(/refresh|permission/i);
    const restored = { ...options, hasUsableAuthority: true };
    rerender(restored);
    expect(result.current.name).toBe("Retained edit");
    act(() => {
      result.current.onSubmit();
    });
    await waitFor(() => {
      expect(options.onSaved).toHaveBeenCalled();
    });
    expect(getRecordedRequests()[0]?.body).toMatchObject({
      name: "Retained edit",
    });
  });
});

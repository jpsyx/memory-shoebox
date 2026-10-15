import {
  BURST_ID,
  makeBurstFrame,
  makeBurstSummary,
} from "@/testing/itemFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DayStream } from "../../../DayStream/DayStream";
import { makeDay, makeItem } from "../../../timelineFixtures";
import { createTimelineMemory } from "../../../windowing/createTimelineMemory/createTimelineMemory";
import { useBurstFan } from "../useBurstFan";

function _fixture() {
  const answers: Array<{
    finish: (value: {
      frames: Array<ReturnType<typeof makeBurstFrame>>;
    }) => void;
    fail: (error: Error) => void;
  }> = [];
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.spyOn(client, "fetchQuery").mockImplementation(() => {
    return new Promise((finish, fail) => {
      return answers.push({ finish, fail });
    });
  });
  const memory = createTimelineMemory();
  const options = {
    viewKey: "view",
    memory,
    retainedBurstIds: new Set([BURST_ID]),
  };
  return { answers, client, memory, options };
}

it("keeps the exact collapsed cover during a held fresh read, then publishes frames and expansion together", async () => {
  const fixture = _fixture();
  const frame = makeBurstFrame(1);
  const days = [
    makeDay({
      items: [makeItem({ itemId: frame.itemId, burst: makeBurstSummary() })],
    }),
  ];
  function Harness() {
    const fan = useBurstFan(fixture.client, fixture.options);
    return (
      <MantineProvider>
        <DayStream
          days={days}
          {...fan}
          onOpenItem={() => {}}
          onReachEnd={() => {}}
          hasMore={false}
          countLabel={undefined}
        />
      </MantineProvider>
    );
  }
  const rendered = render(<Harness />);
  const cover = rendered.container.querySelector<HTMLButtonElement>(
    "[data-burst-id] button",
  )!;
  fireEvent.click(cover);
  expect(cover.isConnected).toBe(true);
  expect(
    rendered.queryByRole("button", { name: "Collapse" }),
  ).not.toBeInTheDocument();
  expect(fixture.memory.get("view").expanded.size).toBe(0);
  await act(async () => {
    return fixture.answers[0]!.finish({ frames: [frame] });
  });
  expect(cover.isConnected).toBe(false);
  expect(
    rendered.getByRole("button", { name: "Collapse" }),
  ).toBeInTheDocument();
  expect(
    rendered.container.querySelector(`[data-item-id="${frame.itemId}"]`),
  ).toBeInTheDocument();
  expect(fixture.memory.get("view").expanded.has(BURST_ID)).toBe(true);
});

it("leaves a failed fresh read collapsed and accepts a real retry", async () => {
  const fixture = _fixture();
  const hook = renderHook(() => {
    return useBurstFan(fixture.client, fixture.options);
  });
  act(() => {
    return hook.result.current.onOpenBurst(BURST_ID);
  });
  await act(async () => {
    return fixture.answers[0]!.fail(new Error("offline"));
  });
  expect(hook.result.current.expanded.size).toBe(0);
  expect(hook.result.current.framesByBurstId.size).toBe(0);
  act(() => {
    return hook.result.current.onOpenBurst(BURST_ID);
  });
  await act(async () => {
    return fixture.answers[1]!.finish({ frames: [makeBurstFrame(1)] });
  });
  expect(hook.result.current.expanded.has(BURST_ID)).toBe(true);
});

describe("retired pending fresh openings", () => {
  it.each(["collapse", "clear", "page", "view", "unmount"] as const)(
    "does not publish after %s",
    async (retirement) => {
      const fixture = _fixture();
      const hook = renderHook(
        ({ options }) => {
          return useBurstFan(fixture.client, options);
        },
        { initialProps: { options: fixture.options } },
      );
      act(() => {
        return hook.result.current.onOpenBurst(BURST_ID);
      });
      if (retirement === "collapse") {
        act(() => {
          return hook.result.current.onCollapseBurst(BURST_ID);
        });
      }
      if (retirement === "clear") {
        act(() => {
          return hook.result.current.onClearBursts();
        });
      }
      if (retirement === "page") {
        hook.rerender({
          options: { ...fixture.options, retainedBurstIds: new Set() },
        });
      }
      if (retirement === "view") {
        hook.rerender({
          options: { ...fixture.options, viewKey: "replacement" },
        });
      }
      if (retirement === "unmount") {
        hook.unmount();
      }
      await act(async () => {
        return fixture.answers[0]!.finish({ frames: [makeBurstFrame(1)] });
      });
      expect(fixture.memory.get("view").expanded.size).toBe(0);
      expect(hook.result.current.framesByBurstId.size).toBe(0);
    },
  );
});

it("bounds pending openings to twenty owners and rejects the retired oldest answer", async () => {
  const fixture = _fixture();
  const ids = Array.from({ length: 21 }, (_, index) => {
    return `burst-${index}`;
  });
  const hook = renderHook(() => {
    return useBurstFan(fixture.client, {
      ...fixture.options,
      retainedBurstIds: new Set(ids),
    });
  });
  for (const id of ids) {
    act(() => {
      return hook.result.current.onOpenBurst(id);
    });
  }
  expect(hook.result.current.expanded.size).toBe(0);
  await act(async () => {
    for (const answer of fixture.answers) {
      answer.finish({ frames: [makeBurstFrame(1)] });
    }
  });
  expect([...hook.result.current.expanded.keys()]).toEqual(ids.slice(1));
  expect([...hook.result.current.framesByBurstId.keys()]).toEqual(ids.slice(1));
});

it("retains the existing measured placeholder while restoring its frames", async () => {
  const fixture = _fixture();
  fixture.memory.expand("view", BURST_ID, 1400);
  const hook = renderHook(() => {
    return useBurstFan(fixture.client, fixture.options);
  });
  act(() => {
    return hook.result.current.onOpenBurst(BURST_ID);
  });
  expect(hook.result.current.expanded.get(BURST_ID)).toEqual({ height: 1400 });
  await act(async () => {
    return fixture.answers[0]!.finish({ frames: [makeBurstFrame(1)] });
  });
  expect(hook.result.current.expanded.get(BURST_ID)).toEqual({ height: 1400 });
});

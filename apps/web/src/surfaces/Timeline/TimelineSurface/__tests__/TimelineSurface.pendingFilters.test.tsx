import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderTimeline, respondWith } from "./timelineSurfaceTestHelpers";

const HOSPITAL = "018f0000-0000-7000-8000-0000000e0001";
const BEACH = "018f0000-0000-7000-8000-0000000e0002";
const ELENA = "018f0000-0000-7000-8000-0000000f0001";

async function _holdNavigation(
  initialPath: string,
): Promise<
  ReturnType<typeof renderTimeline> & { release: () => Promise<void> }
> {
  respondWith({
    "GET /api/timeline/rail": {
      status: 200,
      body: {
        days: [
          {
            capturedOn: "2026-09-27",
            itemCount: 3,
            photoCount: 3,
            videoCount: 0,
          },
          {
            capturedOn: "2026-07-04",
            itemCount: 1,
            photoCount: 1,
            videoCount: 0,
          },
        ],
        nextCursor: null,
      },
    },
    "GET /api/filters/facets": {
      status: 200,
      body: {
        tags: [
          {
            tag: { tagId: HOSPITAL, name: "hospital" },
            isSelected: false,
            narrowedCount: 3,
            ownCount: null,
          },
          {
            tag: { tagId: BEACH, name: "beach" },
            isSelected: false,
            narrowedCount: 3,
            ownCount: null,
          },
        ],
        people: [
          {
            person: { personId: ELENA, displayName: "Elena" },
            isSelected: false,
            narrowedCount: 3,
            ownCount: null,
          },
        ],
        resultCount: 3,
      },
    },
  });
  const rendered = renderTimeline(initialPath);
  await screen.findByRole("button", { name: "hospital 3" });
  const originalFetch = globalThis.fetch;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
    if (String(args[0]).startsWith("/api/bootstrap")) {
      await pending;
    }
    return originalFetch(...args);
  });
  return {
    ...rendered,
    release: async () => {
      await act(async () => {
        release();
      });
      await waitFor(() => {
        expect(rendered.router.state.status).toBe("idle");
      });
    },
  };
}

async function _press(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

async function _date({
  label,
  value,
}: {
  label: string;
  value: string;
}): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("composes tag and both date endpoints while bootstrap holds the preceding selection", async () => {
  const held = await _holdNavigation("/?find=true&at=2026-09-10");
  try {
    await _press("hospital 3");
    expect(held.router.state.location.search).toEqual({
      find: true,
      tag: [HOSPITAL],
    });
    expect(held.router.state.resolvedLocation?.search).toEqual({
      find: true,
      at: "2026-09-10",
    });
    await _date({ label: "From", value: "2026-07-01" });
    await _date({ label: "Until", value: "2026-07-31" });
    expect(held.router.state.location.search).toEqual({
      find: true,
      tag: [HOSPITAL],
      from: "2026-07-01",
      until: "2026-07-31",
    });
  } finally {
    await held.release();
  }
});

it("applies repeated tag toggles against pending membership and preserves the pending person", async () => {
  const held = await _holdNavigation(`/?find=true&tag=${HOSPITAL}`);
  try {
    await _press("beach 3");
    await _press("hospital 3");
    await _press("Elena 3");
    await _press("beach 3");
    expect(held.router.state.location.search).toEqual({
      find: true,
      person: [ELENA],
    });
  } finally {
    await held.release();
  }
});

it("removes only the requested chips from pending selection, including dates and people", async () => {
  const held = await _holdNavigation(
    `/?find=true&tag=${HOSPITAL}&tag=${BEACH}&person=${ELENA}&from=2026-07-01&until=2026-07-31&at=2026-07-10`,
  );
  try {
    await _press("Stop filtering by hospital");
    await _press("Stop filtering by beach");
    await _press("Clear the dates");
    await _press("Stop filtering by Elena");
    expect(held.router.state.location.search).toEqual({ find: true });
  } finally {
    await held.release();
  }
});

it("clear-all preserves the current pending jump and find state", async () => {
  const held = await _holdNavigation(
    `/?find=true&tag=${HOSPITAL}&at=2026-09-10`,
  );
  try {
    await act(async () => {
      void held.router.navigate({
        to: "/",
        search: { tag: [HOSPITAL], find: true, at: "2026-07-04" },
      });
    });
    await _press("Clear, show everything");
    expect(held.router.state.location.search).toEqual({
      find: true,
      at: "2026-07-04",
    });
  } finally {
    await held.release();
  }
});

it("a rail restart preserves filters whose bootstrap has not committed", async () => {
  const held = await _holdNavigation("/?find=true");
  try {
    await _press("hospital 3");
    await act(async () => {
      fireEvent.click(screen.getByRole("combobox", { name: "Jump to" }));
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("option", { name: "4 jul · 1 photo · 0 videos" }),
      );
    });
    expect(held.router.state.location.search).toEqual({
      find: true,
      tag: [HOSPITAL],
      at: "2026-07-04",
    });
  } finally {
    await held.release();
  }
});

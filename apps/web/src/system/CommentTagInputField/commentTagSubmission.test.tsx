import { getRecordedLines, stubFetch } from "@/testing/fetchStubHelpers";
import { ITEM_ID, makeComment } from "@/testing/itemFixtureHelpers";
import {
  makeQueryClientFromItemDetail,
  waitForWritesToSettle,
} from "@/testing/itemWriteTestHelpers";
import { MantineProvider } from "@mantine/core";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CommentTagSubmissionFixture } from "./CommentTagSubmissionFixture";
afterEach(() => {
  vi.unstubAllGlobals();
});
it.each(["ctrlKey", "metaKey"])(
  "requires a new deliberate %s press after member selection",
  async (modifier) => {
    const client = makeQueryClientFromItemDetail();
    const endpoint = `POST /api/items/${ITEM_ID}/comments`;
    stubFetch({
      [`GET /api/items/${ITEM_ID}/comment-tag-candidates`]: {
        status: 200,
        body: {
          members: [
            {
              memberId: "00000000-0000-4000-8000-000000000001",
              displayName: "Jorge",
              avatar: null,
            },
          ],
        },
      },
      [endpoint]: { status: 201, body: makeComment({ body: "@Jorge " }) },
    });
    render(
      <QueryClientProvider client={client}>
        <MantineProvider>
          <CommentTagSubmissionFixture itemId={ITEM_ID} />
        </MantineProvider>
      </QueryClientProvider>,
    );
    const field = screen.getByRole("textbox");
    await userEvent.type(field, "@");
    await screen.findByRole("option", { name: "Jorge" });
    fireEvent.keyDown(field, { key: "Enter", [modifier]: true });
    expect(field).toHaveValue("@Jorge ");
    expect(screen.queryByRole("option")).toBeNull();
    fireEvent.keyDown(field, { key: "Enter", [modifier]: true, repeat: true });
    await act(async () => {
      await new Promise<void>((fulfill) => {
        setTimeout(fulfill, 0);
      });
    });
    await waitForWritesToSettle(client);
    expect(
      getRecordedLines().filter((line) => {
        return line === endpoint;
      }).length,
    ).toBe(0);
    expect(field).toHaveValue("@Jorge ");
    fireEvent.keyDown(field, { key: "Enter", [modifier]: true, repeat: false });
    await act(async () => {
      await new Promise<void>((fulfill) => {
        setTimeout(fulfill, 0);
      });
    });
    await waitForWritesToSettle(client);
    expect(
      getRecordedLines().filter((line) => {
        return line === endpoint;
      }).length,
    ).toBe(1);
    expect(field).toHaveValue("");
    client.clear();
  },
);

import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  renderUploadLabelModal,
  typeUploadLabelThroughForm,
} from "../../../testing/uploadLabelModalTestHelpers";
import { UploadLabelModal } from "./UploadLabelModal";

describe("upload label modal", () => {
  it.each(["tag", "person"] as const)(
    "keeps initial %s input focus and a complete pasted token",
    async (kind) => {
      await renderUploadLabelModal({ kind: kind });
      const input = screen.getByRole("combobox", {
        name: kind === "tag" ? "Tags" : "Who is in them",
      });
      await act(async () => {
        await new Promise((answer) => {
          return setTimeout(answer, 30);
        });
      });
      expect(input).toHaveFocus();
      await userEvent.paste("Immediate complete name");
      await userEvent.keyboard("{Enter}");
      expect(screen.getByText("Immediate complete name")).toBeVisible();
      expect(input).toHaveFocus();
    },
  );

  it("directory failures are unavailable and retryable while typed new labels survive", async () => {
    const harness = await renderUploadLabelModal({
      kind: "tag",
      isUnavailable: true,
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tags are unavailable",
    );
    await typeUploadLabelThroughForm({ name: "Tags", label: "sleeping" });
    fireEvent.click(screen.getByRole("button", { name: "Retry tags" }));
    expect(screen.getByText("sleeping")).toBeVisible();
    harness.api.createUploadEdit.mockImplementationOnce(async () => {
      return {
        editId: makeUploadFileFromPosition(2000).fileId,
        kind: "tag",
        label: "sleeping",
        tag: null,
        person: null,
        milestone: null,
        targetCount: 1,
        createdAt: "2026-10-03T00:00:00.000Z",
        undoneAt: null,
        appliedAt: null,
        canUndo: true,
      };
    });
    fireEvent.click(screen.getByRole("button", { name: "Tag all 1" }));
    await waitFor(() => {
      return expect(harness.api.createUploadEdit).toHaveBeenCalled();
    });
  });

  it("does not expose another member's cached labels while loading", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["tags", ""], {
      tags: [
        {
          tag: {
            tagId: makeUploadFileFromPosition(4000).fileId,
            name: "Former member private label",
          },
          itemCount: 6,
        },
      ],
      nextCursor: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        return new Promise<Response>(() => {});
      }),
    );
    const harness = makeUploadControllerHarness(makeUploadSurfaceDetail());
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const view = render(
      <QueryClientProvider client={client}>
        <MantineProvider>
          <UploadLabelModal
            memberId={harness.serverDetail.uploadedBy.memberId}
            kind="tag"
            opened
            controller={harness.controller}
            snapshot={harness.controller.getSnapshot()}
            onClose={vi.fn()}
          />
        </MantineProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Tags" }));
    expect(
      screen.queryByRole("option", { name: /Former member private label/ }),
    ).toBeNull();
    expect(screen.getByText("Loading tags…")).toBeVisible();
    view.unmount();
    client.clear();
  });
});

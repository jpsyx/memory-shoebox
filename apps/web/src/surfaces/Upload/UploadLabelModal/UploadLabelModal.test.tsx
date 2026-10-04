import userEvent from "@testing-library/user-event";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { stubFetch } from "@/testing/fetchStubHelpers";
import { makeUploadControllerHarness } from "@/upload/uploadSessionController/__tests__/uploadControllerTestHelpers";
import {
  makeUploadSurfaceDetail,
  makeUploadFileFromPosition,
} from "@/upload/uploadSessionController/__tests__/uploadSurfaceFixtures";
import { UploadLabelModal } from "./UploadLabelModal";

async function _render(kind: "tag" | "person", isUnavailable = false) {
  const person = (position: number) => {
    return {
      person: {
        personId: makeUploadFileFromPosition(position + 3000).fileId,
        displayName: "Alex",
      },
      itemCount: position + 10,
      firstCapturedOn: null,
      lastCapturedOn: null,
      face: null,
    };
  };
  stubFetch({
    "GET /api/tags": {
      status: isUnavailable ? 500 : 200,
      body: { tags: [], nextCursor: null },
    },
    "GET /api/people": {
      status: 200,
      body: {
        people: [person(0), person(1)],
        peopleCount: 2,
        nextCursor: null,
      },
    },
  });
  const harness = makeUploadControllerHarness(makeUploadSurfaceDetail());
  await harness.controller.loadSession(harness.serverDetail.sessionId);
  harness.controller.toggleFile(harness.serverDetail.files[0]!.fileId);
  const onClose = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MantineProvider>
        <UploadLabelModal
          memberId={harness.serverDetail.uploadedBy.memberId}
          kind={kind}
          opened
          controller={harness.controller}
          snapshot={harness.controller.getSnapshot()}
          onClose={onClose}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { ...harness, onClose };
}
async function _typeLabel(name: string, label: string) {
  const input = screen.getByRole("combobox", { name });
  await userEvent.type(input, `${label}{Enter}`);
}
describe("upload label modal", () => {
  it("a later label failure keeps earlier success and typed input", async () => {
    const harness = await _render("tag");
    await waitFor(() => {
      return expect(screen.queryByText(/Loading tags/)).not.toBeInTheDocument();
    });
    await _typeLabel("Tags", "hospital");
    await _typeLabel("Tags", "sleeping");
    harness.api.createUploadEdit.mockImplementationOnce(async ({ body }) => {
      return {
        editId: makeUploadFileFromPosition(2000).fileId,
        kind: "tag",
        label: body.labelSnapshot!,
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
    harness.api.createUploadEdit.mockRejectedValueOnce(
      new ApiRequestError({
        status: 400,
        code: "bad_label",
        message: "Later label failed",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Tag all 1" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Later label failed",
    );
    expect(screen.getByText("sleeping")).toBeVisible();
    expect(screen.queryByText("hospital")).not.toBeInTheDocument();
    expect(harness.onClose).not.toHaveBeenCalled();
  });
  it("duplicate person names require an explicit id-valued choice", async () => {
    const harness = await _render("person");
    await waitFor(() => {
      return expect(
        screen.queryByText(/Loading people/),
      ).not.toBeInTheDocument();
    });
    await _typeLabel("Who is in them", "Alex");
    fireEvent.click(screen.getByRole("button", { name: "Tag all 1" }));
    expect(harness.api.createUploadEdit).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("combobox", { name: "Which Alex?" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: /11 photographs/ }),
    );
    harness.api.createUploadEdit.mockImplementationOnce(async () => {
      return {
        editId: makeUploadFileFromPosition(2000).fileId,
        kind: "person",
        label: "Alex",
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
      return expect(harness.api.createUploadEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            personId: makeUploadFileFromPosition(3001).fileId,
          }),
        }),
      );
    });
  });
  it("directory failures are unavailable and retryable while typed new labels survive", async () => {
    const harness = await _render("tag", true);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tags are unavailable",
    );
    await _typeLabel("Tags", "sleeping");
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
  it("prevents repeated submit while the write is pending", async () => {
    const harness = await _render("tag");
    await waitFor(() => {
      return expect(screen.queryByText(/Loading tags/)).not.toBeInTheDocument();
    });
    await _typeLabel("Tags", "sleeping");
    const pending = Promise.withResolvers<never>();
    harness.api.createUploadEdit.mockReturnValueOnce(pending.promise);
    const button = screen.getByRole("button", { name: "Tag all 1" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(harness.api.createUploadEdit).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.reject(new Error("Failed"));
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

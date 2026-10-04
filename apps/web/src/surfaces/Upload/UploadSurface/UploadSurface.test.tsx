import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as controllerModule from "@/upload/uploadSessionController/uploadSessionController";
import { makeUploadControllerHarness } from "@/upload/uploadSessionController/__tests__/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/uploadSessionController/__tests__/uploadSurfaceFixtures";
import { makeViewerFromMeResponse } from "@/session/requireSignedIn/requireSignedIn";
import { UploadSessionProvider } from "@/upload/UploadSessionProvider/UploadSessionProvider";
import { UploadSurface } from "./UploadSurface";
const context = vi.hoisted(() => {
  return {
    viewer: {
      memberId: "018f0000-0000-7000-8000-000000000000",
      displayName: "Papá",
      role: "admin",
      isAdmin: true,
    },
    settings: {
      shoeboxName: "My Shoebox",
      pileArrangement: "messy",
      timezone: "Europe/Madrid",
    },
  };
});
const navigate = vi.hoisted(() => {
  return vi.fn();
});
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...original,
    getRouteApi: () => {
      return {
        useRouteContext: () => {
          return context;
        },
      };
    },
    useNavigate: () => {
      return navigate;
    },
    Link: ({ children }: Readonly<{ children: ReactNode }>) => {
      return <a href="/">{children}</a>;
    },
  };
});
function _render(
  harness: Readonly<ReturnType<typeof makeUploadControllerHarness>>,
  sessionId?: string,
) {
  vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
    harness.controller,
  );
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MantineProvider>
        <UploadSessionProvider
          viewer={context.viewer as ReturnType<typeof makeViewerFromMeResponse>}
        >
          <UploadSurface sessionId={sessionId} />
        </UploadSessionProvider>
      </MantineProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.restoreAllMocks();
  context.viewer.role = "admin";
  navigate.mockReset();
});
describe("the upload surface", () => {
  it("file picker includes a refused PDF in declaration and addresses the batch", async () => {
    const harness = makeUploadControllerHarness();
    const declare = harness.api.putUploadManifest.getMockImplementation()!;
    harness.api.putUploadManifest.mockImplementation(async (options) => {
      const answer = await declare(options);
      harness.serverDetail.files[0]!.state = "refused";
      harness.serverDetail.files[0]!.problemCode = "unsupported_type";
      harness.serverDetail.progress.waitingCount = 0;
      harness.serverDetail.progress.refusedCount = 1;
      return answer;
    });
    _render(harness);
    await screen.findByRole("heading", { name: "Put it all up." });
    await waitFor(() => {
      expect(harness.controller.getSnapshot().phase).toBe("idle");
    });
    fireEvent.change(screen.getByLabelText("Choose photographs and videos"), {
      target: {
        files: [
          new File(["pdf"], "not-media.pdf", { type: "application/pdf" }),
        ],
      },
    });
    await waitFor(() => {
      expect(harness.api.putUploadManifest).toHaveBeenCalled();
    });
    expect(
      harness.api.putUploadManifest.mock.calls[0]![0].files.map((file) => {
        return file.originalFilename;
      }),
    ).toContain("not-media.pdf");
    await screen.findByText(
      "This is not a supported photograph or video. It cannot go up here.",
    );
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          replace: true,
          search: { session: harness.serverDetail.sessionId },
        }),
      );
    });
  });
  it("viewer has no upload action or query", async () => {
    context.viewer.role = "viewer";
    const harness = makeUploadControllerHarness();
    _render(harness);
    expect(screen.queryByRole("button", { name: /Put .* up/ })).toBeNull();
    expect(screen.queryByLabelText("Choose photographs and videos")).toBeNull();
    await act(async () => {});
    expect(harness.api.getCurrentUploadSession).not.toHaveBeenCalled();
  });
  it("settled recovery has no second-email promise and refuses without Retry", async () => {
    const file = {
      ...makeUploadFileFromPosition(0),
      state: "refused" as const,
      problemCode: "unsupported_type" as const,
    };
    const detail = makeUploadSurfaceDetail({
      state: "settled",
      files: [file],
      fileCount: 1,
      progress: {
        waitingCount: 0,
        sendingCount: 0,
        doneCount: 0,
        failedCount: 0,
        refusedCount: 1,
        cancelledCount: 0,
        doneBytes: 0,
      },
      summary: {
        itemCount: 0,
        dayCount: 0,
        milestoneCount: 0,
        burstCount: 0,
        burstFrameCount: 0,
        notifiedMemberCount: null,
      },
    });
    const harness = makeUploadControllerHarness(detail);
    _render(harness, detail.sessionId);
    await screen.findByText(
      "This is not a supported photograph or video. It cannot go up here.",
    );
    expect(screen.queryByRole("button", { name: /Retry IMG/ })).toBeNull();
    expect(
      screen.queryByText(/You can close this\. They keep going/),
    ).toBeNull();
    expect(screen.queryByText(/email was sent/)).toBeNull();
    await act(async () => {
      const snapshot = harness.controller.getSnapshot();
      harness.serverDetail.files[0]!.state = "done";
      snapshot.fileActivityById.set(file.fileId, {
        kind: "confirmed",
        state: "done",
        isIncludedInEmail: false,
      });
      await harness.controller.loadSession(detail.sessionId);
    });
    expect(
      screen.getByText(
        "This photograph will appear on its day without another email.",
      ),
    ).toBeVisible();
  });
  it("keeps a restriction chosen before declaration and removes a cancelled draft address", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ error: "not_found", message: "Unavailable" }),
          { status: 404 },
        );
      }),
    );
    const harness = makeUploadControllerHarness();
    _render(harness);
    await waitFor(() => {
      expect(harness.controller.getSnapshot().isBusy).toBe(false);
    });
    fireEvent.click(screen.getByRole("radio", { name: "Only" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Only these" }));
    fireEvent.click(await screen.findByRole("option", { name: /Papá/ }));
    fireEvent.change(screen.getByLabelText("Choose photographs and videos"), {
      target: { files: [new File(["bytes"], "a.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByRole("button", { name: "Put 1 up" });
    expect(screen.getByRole("radio", { name: "Only" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(navigate).toHaveBeenLastCalledWith({
        to: "/upload",
        search: {},
        replace: true,
      });
    });
  });
  it("restores focus to the bulk action after cancelling its modal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ tags: [], nextCursor: null }), {
          status: 200,
        });
      }),
    );
    const detail = makeUploadSurfaceDetail();
    const harness = makeUploadControllerHarness(detail);
    await harness.controller.loadSession(detail.sessionId);
    harness.controller.toggleFile(detail.files[0]!.fileId);
    _render(harness, detail.sessionId);
    const trigger = screen.getByRole("button", {
      name: "Add a tag",
    });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });
  it("retains failed same-kind text and clears it when changing to people", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => {
        return new Response(
          JSON.stringify(
            path.includes("people")
              ? { people: [], peopleCount: 0, nextCursor: null }
              : { tags: [], nextCursor: null },
          ),
          { status: 200 },
        );
      }),
    );
    const detail = makeUploadSurfaceDetail();
    const harness = makeUploadControllerHarness(detail);
    await harness.controller.loadSession(detail.sessionId);
    harness.controller.toggleFile(detail.files[0]!.fileId);
    harness.api.createUploadEdit.mockRejectedValueOnce(
      new Error("Keep this input"),
    );
    _render(harness, detail.sessionId);
    fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
    await userEvent.type(
      await screen.findByRole("combobox", { name: "Tags" }),
      "hospital{Enter}",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tag all 1" }));
    await within(screen.getByRole("dialog")).findByText(/Keep this input/);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
    expect(
      within(screen.getByRole("dialog")).getByText("hospital"),
    ).toBeVisible();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    const personTrigger = screen.getByRole("button", {
      name: "Tag somebody",
    });
    personTrigger.focus();
    fireEvent.click(personTrigger);
    expect(
      within(screen.getByRole("dialog")).queryByText("hospital"),
    ).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Who is in them" }),
    ).toHaveValue("");
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );
    await waitFor(() => {
      expect(personTrigger).toHaveFocus();
      expect(personTrigger.tabIndex).toBe(0);
    });
  });
});

import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import * as controllerModule from "@/upload/createUploadSessionController/createUploadSessionController";
import { UploadSessionProvider } from "@/upload/UploadSessionProvider/UploadSessionProvider";
import { MantineProvider } from "@mantine/core";
import type { ShellSettings } from "@memory-shoebox/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { useNavigate } from "@tanstack/react-router";
import type { RenderResult } from "@testing-library/react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadSurface } from "../UploadSurface";
const context: {
  viewer: { -readonly [Key in keyof Viewer]: Viewer[Key] };
  settings: ShellSettings;
} = vi.hoisted(() => {
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
const navigate: ReturnType<typeof vi.fn<ReturnType<typeof useNavigate>>> =
  vi.hoisted(() => {
    return vi.fn<ReturnType<typeof useNavigate>>();
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
function _render({
  harness,
  sessionId,
}: Readonly<{
  harness: Readonly<ReturnType<typeof makeUploadControllerHarness>>;
  sessionId?: string;
}>): RenderResult {
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
        <UploadSessionProvider viewer={context.viewer}>
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
  it("Upload more restores focus to the fresh picker heading", async () => {
    const detail = makeUploadSurfaceDetail({
      state: "settled",
      files: [{ ...makeUploadFileFromPosition(0), state: "done" }],
      fileCount: 1,
    });
    const harness = makeUploadControllerHarness(detail);
    _render({ harness, sessionId: detail.sessionId });
    const button = await screen.findByRole("button", { name: "Upload more" });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => {
      return expect(
        screen.getByRole("heading", { name: "Put it all up." }),
      ).toHaveFocus();
    });
    expect(
      screen.getByLabelText("Choose photographs and videos"),
    ).toBeInTheDocument();
  });
  it("viewer has no upload action or query", async () => {
    context.viewer.role = "viewer";
    const harness = makeUploadControllerHarness();
    _render({ harness: harness });
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
    _render({ harness: harness, sessionId: detail.sessionId });
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
    _render({ harness: harness, sessionId: detail.sessionId });
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
    _render({ harness: harness, sessionId: detail.sessionId });
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

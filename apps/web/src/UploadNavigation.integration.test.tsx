import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import * as controllerModule from "@/upload/createUploadSessionController/createUploadSessionController";
import { UploadSessionProvider } from "@/upload/UploadSessionProvider/UploadSessionProvider";
import { MantineProvider } from "@mantine/core";
import type { ShellSettings } from "@memory-shoebox/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { useNavigate } from "@tanstack/react-router";
import type { RenderResult } from "@testing-library/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadSurface } from "./surfaces/Upload/UploadSurface/UploadSurface";
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
    _render({ harness: harness });
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
    _render({ harness: harness });
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
    screen.getByRole("button", { name: "Cancel" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(navigate).toHaveBeenLastCalledWith({
        to: "/upload",
        search: {},
        replace: true,
      });
    });
    expect(
      screen.getByRole("heading", { name: "Put it all up." }),
    ).toHaveFocus();
  });
});

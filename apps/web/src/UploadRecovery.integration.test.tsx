import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import {
  makeUploadControllerHarness,
  makeUploadRecoveryControllerHarness,
  makeDeferredAnswer,
} from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadSurfaceDetail,
  makeUploadFileFromPosition,
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
} from "@testing-library/react";
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
type SurfaceRootOptions = {
  client: QueryClient;
  address?: string;
  key?: number;
  isVisible?: boolean;
};
function _getSurfaceRootFromOptions({
  client,
  address,
  key = 0,
  isVisible = true,
}: Readonly<SurfaceRootOptions>): ReactNode {
  return (
    <QueryClientProvider client={client}>
      <MantineProvider>
        <UploadSessionProvider viewer={context.viewer}>
          {isVisible ? (
            <UploadSurface key={key} sessionId={address} />
          ) : (
            <span>The pile</span>
          )}
        </UploadSessionProvider>
      </MantineProvider>
    </QueryClientProvider>
  );
}

function _render({
  harness,
  sessionId,
}: Readonly<{
  harness: Readonly<{
    controller: import("@/upload/createUploadSessionController/createUploadSessionController.types").UploadSessionController;
  }>;
  sessionId?: string;
}>): RenderResult & {
  replaceSurface: (
    options?: Readonly<{ address?: string; key?: number; isVisible?: boolean }>,
  ) => void;
} {
  vi.spyOn(controllerModule, "createUploadSessionController").mockReturnValue(
    harness.controller,
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    _getSurfaceRootFromOptions({ client, address: sessionId }),
  );
  return {
    ...result,
    replaceSurface: ({
      address,
      key = 0,
      isVisible = true,
    }: Readonly<{
      address?: string;
      key?: number;
      isVisible?: boolean;
    }> = {}) => {
      result.rerender(
        _getSurfaceRootFromOptions({ client, address, key, isVisible }),
      );
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  context.viewer.role = "admin";
  navigate.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Unavailable" }),
        { status: 404 },
      );
    }),
  );
});
describe("upload draft and addressed recovery", () => {
  it("retries the existing settled file when its original is picked again", async () => {
    const row = {
      ...makeUploadFileFromPosition(1),
      state: "failed" as const,
      contentHash: "1".padStart(64, "0"),
    };
    const harness = makeUploadRecoveryControllerHarness({
      rows: [row],
      state: "settled",
    });
    _render({ harness, sessionId: harness.serverDetail.sessionId });
    await waitFor(() => {
      expect(harness.controller.getSnapshot().detail?.state).toBe("settled");
      expect(harness.controller.getSnapshot().isBusy).toBe(false);
    });
    fireEvent.change(screen.getByLabelText("Choose photographs and videos"), {
      target: { files: harness.files },
    });
    await waitFor(() => {
      expect(harness.engine.start).toHaveBeenCalledOnce();
    });
    expect(harness.api.openUploadSession).not.toHaveBeenCalled();
    expect(harness.engine.start.mock.calls[0]![0][0]!.fileId).toBe(row.fileId);
    expect(
      harness.controller.getSnapshot().fileActivityById.get(row.fileId)
        ?.isIncludedInEmail,
    ).toBe(false);
    await act(async () => {
      harness.answerRun();
    });
  });
  it("keeps a fresh picker selection while reentry waits for the old draft cancellation", async () => {
    const harness = makeUploadControllerHarness();
    const view = _render({ harness });
    await waitFor(() => {
      expect(harness.controller.getSnapshot().isBusy).toBe(false);
    });
    fireEvent.change(screen.getByLabelText("Choose photographs and videos"), {
      target: { files: [new File(["old"], "old.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByRole("button", { name: "Put 1 up" });
    const cancellation = makeDeferredAnswer<void>();
    harness.api.cancelUploadSession.mockReturnValueOnce(cancellation.promise);
    fireEvent(window, new Event("pagehide"));
    view.replaceSurface({ isVisible: false });
    await act(async () => {});
    view.replaceSurface({ key: 1 });
    const freshFile = new File(["fresh"], "fresh.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Choose photographs and videos"), {
      target: { files: [freshFile] },
    });
    await act(async () => {
      cancellation.answer();
    });
    await waitFor(() => {
      expect([...harness.controller.getSnapshot().filesById.values()]).toEqual([
        freshFile,
      ]);
    });
  });
  it.each(["only", "except"] as const)(
    "discards an unstarted %s draft after failed arm and route exit",
    async (mode) => {
      const harness = makeUploadControllerHarness();
      const view = _render({ harness: harness });
      await waitFor(() => {
        expect(harness.controller.getSnapshot().isBusy).toBe(false);
      });
      fireEvent.click(
        screen.getByRole("radio", {
          name: mode === "only" ? "Only" : "Except",
        }),
      );
      fireEvent.click(
        screen.getByRole("combobox", {
          name: mode === "only" ? "Only these" : "Everybody except these",
        }),
      );
      fireEvent.click(await screen.findByRole("option", { name: /Papá/ }));
      fireEvent.change(screen.getByLabelText("Choose photographs and videos"), {
        target: {
          files: [new File(["bytes"], "a.jpg", { type: "image/jpeg" })],
        },
      });
      await screen.findByRole("button", { name: "Put 1 up" });
      harness.api.setUploadVisibility.mockImplementation(async (options) => {
        const saved = {
          visibilityRuleId: "restricted",
          mode: options.body.mode,
          label: null,
          subjects: options.body.subjects.map(({ kind, id }) => {
            return { kind, id, displayName: "Papá" };
          }),
        };
        harness.serverDetail.visibility = saved;
        return saved;
      });
      harness.api.commitUploadSession.mockRejectedValue(
        new Error("Arm rejected"),
      );
      fireEvent.click(screen.getByRole("button", { name: "Put 1 up" }));
      await waitFor(() => {
        expect(harness.api.commitUploadSession).toHaveBeenCalledOnce();
      });
      await waitFor(() => {
        expect(harness.controller.getSnapshot().isBusy).toBe(false);
      });
      expect(harness.controller.getSnapshot().declarationTotal).toBe(1);
      harness.api.cancelUploadSession.mockImplementation(async () => {
        harness.serverDetail.state = "cancelled";
      });
      view.replaceSurface({ address: undefined, key: 0, isVisible: false });
      await waitFor(() => {
        expect(harness.controller.getSnapshot().phase).toBe("idle");
      });
      view.replaceSurface({ address: harness.serverDetail.sessionId, key: 1 });
      await waitFor(() => {
        expect(screen.getByRole("radio", { name: "Everyone" })).toBeChecked();
      });
      expect(
        screen.queryByRole("button", { name: "Put 1 up" }),
      ).not.toBeInTheDocument();
      expect(harness.api.commitUploadSession).toHaveBeenCalledOnce();
      expect(harness.api.cancelUploadSession).toHaveBeenCalledOnce();
      expect(harness.serverDetail.visibility.mode).toBe(mode);
    },
  );

  it("discards an addressed unstarted draft instead of restoring its original matches", async () => {
    const harness = makeUploadControllerHarness(makeUploadSurfaceDetail());
    _render({ harness, sessionId: harness.serverDetail.sessionId });
    await waitFor(() => {
      expect(harness.api.cancelUploadSession).toHaveBeenCalledOnce();
      expect(harness.controller.getSnapshot().phase).toBe("idle");
    });
    expect(
      screen.queryByRole("button", { name: "Put 264 up" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Saved original" }),
    ).not.toBeInTheDocument();
    expect(harness.api.commitUploadSession).not.toHaveBeenCalled();
    expect(harness.engine.start).not.toHaveBeenCalled();
  });

  it("retains requested B and retries B when provider detail A survives a failed read", async () => {
    const harness = makeUploadControllerHarness(
      makeUploadSurfaceDetail({ state: "uploading" }),
    );
    const requestedId = "018f0000-0000-7000-8000-00000000c002";
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    harness.api.getUploadSession.mockClear();
    harness.api.getUploadSession.mockRejectedValueOnce(new Error("Offline"));
    const view = _render({ harness: harness, sessionId: requestedId });
    await waitFor(() => {
      expect(harness.controller.getSnapshot().isBusy).toBe(false);
    });
    expect(harness.controller.getSnapshot().detail?.sessionId).toBe(
      harness.serverDetail.sessionId,
    );
    expect(navigate).not.toHaveBeenCalled();
    harness.api.getUploadSession.mockResolvedValueOnce({
      ...harness.serverDetail,
      sessionId: requestedId,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Read this batch again" }),
    );
    await waitFor(() => {
      expect(harness.controller.getSnapshot().detail?.sessionId).toBe(
        requestedId,
      );
    });
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(2);
    expect(harness.api.getUploadSession).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sessionId: requestedId }),
    );
    expect(harness.api.getUploadSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sessionId: requestedId }),
    );
    expect(navigate).not.toHaveBeenCalled();
    view.replaceSurface({ address: requestedId, key: 1 });
    expect(harness.controller.getSnapshot().detail?.sessionId).toBe(
      requestedId,
    );
  });
});

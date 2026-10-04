import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import {
  makeUploadControllerHarness,
  makeUploadRecoveryControllerHarness,
} from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
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
  it.each(["only", "except"] as const)(
    "restores saved %s after failed arm and surface remount",
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
      view.replaceSurface({ address: undefined, key: 0, isVisible: false });
      view.replaceSurface({ address: harness.serverDetail.sessionId, key: 1 });
      expect(
        screen.getByRole("radio", {
          name: mode === "only" ? "Only" : "Except",
        }),
      ).toBeChecked();
      fireEvent.click(screen.getByRole("button", { name: "Put 1 up" }));
      await waitFor(() => {
        expect(harness.api.commitUploadSession).toHaveBeenCalledTimes(2);
      });
      expect(harness.api.setUploadVisibility).toHaveBeenLastCalledWith({
        sessionId: harness.serverDetail.sessionId,
        body: {
          mode,
          subjects: [{ kind: "member", id: context.viewer.memberId }],
        },
      });
      expect(harness.serverDetail.visibility.mode).toBe(mode);
    },
  );

  it("matches ambiguous restored draft originals without arming until explicit Put", async () => {
    const rows = [0, 1].map((position) => {
      return {
        ...makeUploadFileFromPosition(position),
        originalFilename: "same.jpg",
        capturedOn: position === 0 ? "2026-09-15" : "2026-09-17",
        declaredBytes: 5,
      };
    });
    const harness = makeUploadRecoveryControllerHarness({
      rows: rows,
      state: "draft",
    });
    harness.files[1] = new File([new Uint8Array([1, 0, 0, 0, 0])], "same.jpg", {
      type: "image/jpeg",
    });
    vi.spyOn(harness.worker, "postMessage").mockImplementation((request) => {
      if (request.kind === "hash") {
        queueMicrotask(() => {
          harness.worker.onmessage?.(
            new MessageEvent("message", {
              data: {
                kind: "hashed",
                requestId: request.requestId,
                contentHash: (harness.files.indexOf(request.file as File) + 1)
                  .toString()
                  .padStart(64, "0"),
              },
            }),
          );
        });
      }
    });
    _render({ harness: harness, sessionId: harness.serverDetail.sessionId });
    await screen.findByRole("button", { name: "Put 2 up" });
    fireEvent.change(screen.getByLabelText("Choose photographs and videos"), {
      target: { files: harness.files },
    });
    await screen.findByRole("combobox", { name: "Saved original" });
    for (const row of rows) {
      expect(
        screen.getByText(`Chosen file ${row.position + 1} of 2: same.jpg`),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Skip this chosen file" }),
      ).toBeEnabled();
      expect(
        screen.getByRole("option", {
          name: new RegExp(`saved file ${row.position + 1}, ${row.capturedOn}`),
        }),
      ).toBeInTheDocument();
      fireEvent.change(
        screen.getByRole("combobox", { name: "Saved original" }),
        { target: { value: row.fileId } },
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Use this original" }),
      );
      await waitFor(() => {
        expect(
          harness.controller
            .getSnapshot()
            .recoveryMatches.knownMatches.some((match) => {
              return match.fileId === row.fileId;
            }),
        ).toBe(true);
      });
    }
    await waitFor(() => {
      expect(harness.controller.getSnapshot().isBusy).toBe(false);
    });
    expect(harness.controller.getSnapshot().filesById.size).toBe(2);
    expect(harness.api.commitUploadSession).not.toHaveBeenCalled();
    expect(harness.engine.start).not.toHaveBeenCalled();
    harness.api.setUploadVisibility.mockResolvedValue(
      harness.serverDetail.visibility,
    );
    fireEvent.click(screen.getByRole("button", { name: "Put 2 up" }));
    await waitFor(() => {
      expect(harness.engine.start).toHaveBeenCalledOnce();
    });
    expect(harness.api.commitUploadSession).toHaveBeenCalledWith({
      sessionId: harness.serverDetail.sessionId,
      intent: "arm",
    });
  });

  it("retains requested B and retries B when provider detail A survives a failed read", async () => {
    const harness = makeUploadControllerHarness(makeUploadSurfaceDetail());
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

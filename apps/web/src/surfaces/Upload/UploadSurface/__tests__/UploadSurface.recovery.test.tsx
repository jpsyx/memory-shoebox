import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import { makeUploadSurfaceDetail } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import * as controllerModule from "@/upload/createUploadSessionController/createUploadSessionController";
import { UploadSessionProvider } from "@/upload/UploadSessionProvider/UploadSessionProvider";
import { MantineProvider } from "@mantine/core";
import type { ShellSettings } from "@memory-shoebox/shared";
import { uploadSessionDetailSchema } from "@memory-shoebox/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { useNavigate } from "@tanstack/react-router";
import type { RenderResult } from "@testing-library/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("shows safe malformed-response copy and retries the same addressed batch", async () => {
    const harness = makeUploadControllerHarness(makeUploadSurfaceDetail());
    harness.api.getUploadSession.mockImplementationOnce(async () => {
      return uploadSessionDetailSchema.parse({
        summary: { burstFrameCount: "internal_bad_value" },
      });
    });
    _render({ harness: harness, sessionId: harness.serverDetail.sessionId });
    await screen.findByText(
      "This batch could not be read. What is saved stays saved. Try reading it again.",
    );
    expect(document.body.textContent).not.toMatch(
      /invalid_type|expected|summary|internal_bad_value/,
    );
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Read this batch again" }),
    );
    await screen.findByRole("button", { name: "Put 264 up" });
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(2);
    expect(harness.api.getUploadSession).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ sessionId: harness.serverDetail.sessionId }),
    );
    expect(harness.api.getUploadSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sessionId: harness.serverDetail.sessionId }),
    );
  });

  it("returns expired authentication to requested B rather than retained provider A", async () => {
    const harness = makeUploadControllerHarness(makeUploadSurfaceDetail());
    const requestedId = "018f0000-0000-7000-8000-00000000c002";
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    harness.api.getUploadSession.mockRejectedValueOnce(
      new ApiRequestError({
        status: 401,
        code: "not_signed_in",
        message: "Secret diagnostics",
      }),
    );
    _render({ harness: harness, sessionId: requestedId });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith({
        to: "/sign-in",
        search: { redirect: `/upload?session=${requestedId}` },
        replace: true,
      });
    });
    expect(document.body.textContent).not.toContain("Secret diagnostics");
    expect(navigate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        to: "/upload",
        search: { session: harness.serverDetail.sessionId },
      }),
    );
  });
});

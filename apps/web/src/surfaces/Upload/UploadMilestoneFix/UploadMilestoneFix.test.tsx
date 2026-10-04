import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import {
  makeDeferredAnswer,
  makeUploadControllerHarness,
} from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadMilestoneDetail,
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
import { describe, expect, it, vi } from "vitest";
import { UploadMilestoneFix } from "./UploadMilestoneFix";

type FixHarness =
  import("@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers.types").UploadControllerHarness & {
    group: import("@memory-shoebox/shared").UploadSessionDetail["mismatches"][number];
    onDismiss: ReturnType<typeof vi.fn<() => void>>;
    invalidate: import("vitest").MockInstance<QueryClient["invalidateQueries"]>;
  };
function _makeFixDetailFromSpan(
  isSpan: boolean,
): import("@memory-shoebox/shared").UploadSessionDetail {
  const milestone = {
    ...makeUploadMilestoneDetail().milestone,
    startsOn: isSpan ? "2026-09-16" : "2026-09-17",
  };
  const files = Array.from({ length: 4 }, (_, position) => {
    return {
      ...makeUploadFileFromPosition(position),
      capturedOn: "2026-09-15",
    };
  });
  const group = {
    milestone,
    files: files.map(({ fileId, originalFilename, capturedOn }) => {
      return {
        fileId,
        originalFilename,
        capturedOn,
      };
    }),
  };
  return makeUploadSurfaceDetail({ files, fileCount: 4, mismatches: [group] });
}
async function _render({
  isSpan = true,
  patchStatus = 200,
}: Readonly<{ isSpan?: boolean; patchStatus?: number }>): Promise<FixHarness> {
  const detail = _makeFixDetailFromSpan(isSpan);
  const group = detail.mismatches[0]!;
  const milestone = group.milestone;
  const harness = makeUploadControllerHarness(detail);
  await harness.controller.loadSession(harness.serverDetail.sessionId);
  stubFetch({
    [`PATCH /api/milestones/${milestone.milestoneId}`]: {
      status: patchStatus,
      body:
        patchStatus === 200
          ? makeUploadMilestoneDetail()
          : { error: "not_found", message: "No route" },
    },
  });
  const onDismiss = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <MantineProvider>
        <UploadMilestoneFix
          group={group}
          snapshot={harness.controller.getSnapshot()}
          controller={harness.controller}
          onDismiss={onDismiss}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
  return { ...harness, group, onDismiss, invalidate };
}
describe("pre-ingest milestone dates", () => {
  it("late widening does not read or write a replacement batch", async () => {
    const harness = await _render({});
    const response = makeDeferredAnswer<Response>();
    vi.mocked(fetch).mockReturnValueOnce(response.promise);
    fireEvent.click(screen.getByLabelText("Widen the occasion to cover them"));
    fireEvent.click(screen.getByRole("button", { name: "Widen the occasion" }));
    harness.serverDetail.sessionId = "018f0000-0000-7000-8000-00000000c002";
    await harness.controller.loadSession(harness.serverDetail.sessionId);
    const reads = harness.api.getUploadSession.mock.calls.length;
    await act(async () => {
      response.answer(Response.json(makeUploadMilestoneDetail()));
      await response.promise;
    });
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(reads);
    expect(harness.api.putUploadManifest).not.toHaveBeenCalled();
    expect(harness.onDismiss).not.toHaveBeenCalled();
  });
  it("leave retains the attachment and original days without claiming acknowledgment", async () => {
    const harness = await _render({});
    fireEvent.click(
      screen.getByRole("button", { name: "Leave them as they are" }),
    );
    expect(harness.onDismiss).toHaveBeenCalledTimes(1);
    expect(harness.api.putUploadManifest).not.toHaveBeenCalled();
    expect(getRecordedRequests()).toHaveLength(0);
    expect(harness.serverDetail.mismatches).toEqual([harness.group]);
    expect(
      harness.serverDetail.files.map((file) => {
        return file.capturedOn;
      }),
    ).toEqual(Array(4).fill("2026-09-15"));
  });
  it("missing widening routes retain the prompt and offer retry", async () => {
    const harness = await _render({ isSpan: true, patchStatus: 404 });
    fireEvent.click(screen.getByLabelText("Widen the occasion to cover them"));
    fireEvent.click(screen.getByRole("button", { name: "Widen the occasion" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/unavailable/i);
    expect(harness.onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Widen the occasion" }));
    await waitFor(() => {
      return expect(getRecordedRequests()).toHaveLength(2);
    });
  });
});

import { getRecordedRequests, stubFetch } from "@/testing/fetchStubHelpers";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadMilestoneDetail,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadMilestoneFix } from "./surfaces/Upload/UploadMilestoneFix/UploadMilestoneFix";

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
  it("span move requires each file's explicitly chosen day", async () => {
    const harness = await _render({});
    expect(screen.getByRole("button", { name: "Move the 4" })).toBeDisabled();
    const inputs = screen.getAllByLabelText(/Which day .* belongs to/);
    expect(
      inputs.map((input) => {
        return (input as HTMLInputElement).value;
      }),
    ).toEqual(["", "", "", ""]);
    inputs.slice(0, 3).forEach((input) => {
      return fireEvent.change(input, { target: { value: "2026-09-16" } });
    });
    expect(screen.getByRole("button", { name: "Move the 4" })).toBeDisabled();
    fireEvent.change(inputs[3]!, { target: { value: "2026-09-17" } });
    fireEvent.click(screen.getByRole("button", { name: "Move the 4" }));
    await waitFor(() => {
      return expect(harness.onDismiss).toHaveBeenCalledTimes(1);
    });
    expect(harness.api.putUploadManifest).toHaveBeenCalledWith({
      sessionId: harness.serverDetail.sessionId,
      files: expect.arrayContaining([
        expect.objectContaining({
          fileId: harness.group.files[0]!.fileId,
          capturedAt: "2026-09-16T00:00:00.000Z",
        }),
        expect.objectContaining({
          fileId: harness.group.files[3]!.fileId,
          capturedAt: "2026-09-17T00:00:00.000Z",
        }),
      ]),
    });
    expect(getRecordedRequests()).toHaveLength(0);
  });
  it("one-day moves send the single day for every waiting manifest row", async () => {
    const harness = await _render({ isSpan: false });
    fireEvent.click(screen.getByRole("button", { name: "Move the 4" }));
    await waitFor(() => {
      return expect(harness.onDismiss).toHaveBeenCalled();
    });
    expect(
      harness.api.putUploadManifest.mock.calls[0]![0].files.map((file) => {
        return file.capturedAt;
      }),
    ).toEqual(Array(4).fill("2026-09-17T00:00:00.000Z"));
  });
  it("widening patches the span, refreshes detail and inactive queries, touching no manifest", async () => {
    const harness = await _render({});
    fireEvent.click(screen.getByLabelText("Widen the occasion to cover them"));
    fireEvent.click(screen.getByRole("button", { name: "Widen the occasion" }));
    await waitFor(() => {
      return expect(harness.onDismiss).toHaveBeenCalled();
    });
    expect(getRecordedRequests()).toEqual([
      {
        method: "PATCH",
        url: `/api/milestones/${harness.group.milestone.milestoneId}`,
        body: { startsOn: "2026-09-15", endsOn: "2026-09-17" },
      },
    ]);
    expect(harness.api.putUploadManifest).not.toHaveBeenCalled();
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(2);
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["timeline"],
      refetchType: "inactive",
    });
    expect(harness.invalidate).toHaveBeenCalledWith({
      queryKey: ["milestones"],
      refetchType: "inactive",
    });
  });
  it("confirmed widening retries only the failed detail read", async () => {
    const harness = await _render({});
    harness.api.getUploadSession.mockRejectedValueOnce(
      new Error("Read offline"),
    );
    fireEvent.click(screen.getByLabelText("Widen the occasion to cover them"));
    fireEvent.click(screen.getByRole("button", { name: "Widen the occasion" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The occasion was widened",
    );
    fireEvent.click(screen.getByRole("button", { name: "Widen the occasion" }));
    await waitFor(() => {
      return expect(harness.onDismiss).toHaveBeenCalledOnce();
    });
    expect(
      getRecordedRequests().filter((request) => {
        return request.method === "PATCH";
      }),
    ).toHaveLength(1);
    expect(harness.api.getUploadSession).toHaveBeenCalledTimes(3);
  });
});

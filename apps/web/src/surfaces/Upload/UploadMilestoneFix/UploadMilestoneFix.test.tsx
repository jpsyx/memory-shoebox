import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { stubFetch, getRecordedRequests } from "@/testing/fetchStubHelpers";
import { makeUploadControllerHarness } from "@/upload/uploadSessionController/__tests__/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadMilestoneDetail,
  makeUploadSurfaceDetail,
} from "@/upload/uploadSessionController/__tests__/uploadSurfaceFixtures";
import { UploadMilestoneFix } from "./UploadMilestoneFix";

async function _render(isSpan = true, patchStatus = 200) {
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
  const harness = makeUploadControllerHarness(
    makeUploadSurfaceDetail({ files, fileCount: 4, mismatches: [group] }),
  );
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
    const harness = await _render();
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
    const harness = await _render(false);
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
    const harness = await _render();
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
  it("leave retains the attachment and original days without claiming acknowledgment", async () => {
    const harness = await _render();
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
    const harness = await _render(true, 404);
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

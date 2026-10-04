import { stubFetch } from "@/testing/fetchStubHelpers";
import { makeUploadControllerHarness } from "@/upload/createUploadSessionController/__tests__/uploadControllerTestHelpers/uploadControllerTestHelpers";
import {
  makeUploadFileFromPosition,
  makeUploadSurfaceDetail,
} from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import type { TagCount } from "@memory-shoebox/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { UploadLabelModal } from "../surfaces/Upload/UploadLabelModal/UploadLabelModal";

type Options = {
  kind: "tag" | "person";
  isUnavailable?: boolean;
  fileCount?: number;
  tags?: TagCount[];
};
function _getPersonFromPosition(
  position: number,
): import("@memory-shoebox/shared").DirectoryPerson {
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
}
function _stubDirectories({
  tags = [],
  isUnavailable,
}: Readonly<Options>): void {
  stubFetch({
    "GET /api/tags": {
      status: isUnavailable ? 500 : 200,
      body: { tags, nextCursor: null },
    },
    "GET /api/people": {
      status: 200,
      body: {
        people: [_getPersonFromPosition(0), _getPersonFromPosition(1)],
        peopleCount: 2,
        nextCursor: null,
      },
    },
  });
}
function _renderModal(
  options: Readonly<{
    kind: Options["kind"];
    harness: ReturnType<typeof makeUploadControllerHarness>;
    onClose: () => void;
  }>,
): void {
  const { kind, harness, onClose } = options;
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
}

/** Renders the real label form with a controlled catalog API. */
export async function renderUploadLabelModal({
  fileCount = 1,
  ...options
}: Readonly<Options>): Promise<
  ReturnType<typeof makeUploadControllerHarness> & {
    onClose: ReturnType<typeof vi.fn<() => void>>;
  }
> {
  _stubDirectories(options);
  const harness = makeUploadControllerHarness(
    makeUploadSurfaceDetail({
      fileCount,
      files: Array.from({ length: fileCount }, (_, position) => {
        return makeUploadFileFromPosition(position);
      }),
    }),
  );
  await harness.controller.loadSession(harness.serverDetail.sessionId);
  harness.controller.selectAll();
  const onClose = vi.fn();
  _renderModal({ kind: options.kind, harness, onClose });
  return { ...harness, onClose };
}

/** Adds one label token through the rendered combobox. */
export async function typeUploadLabelThroughForm(
  options: Readonly<{ name: string; label: string }>,
): Promise<void> {
  const input = screen.getByRole("combobox", { name: options.name });
  await userEvent.type(input, `${options.label}{Enter}`);
}

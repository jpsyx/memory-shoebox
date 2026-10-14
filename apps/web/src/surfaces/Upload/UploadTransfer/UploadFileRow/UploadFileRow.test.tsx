import { makeUploadFileFromPosition } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UploadFileRow } from "./UploadFileRow";

it.each([
  [
    "abandoned",
    "Sending stopped before this file arrived. Retry this original to resume.",
  ],
  [null, "This file is not confirmed up. Retry this original to resume."],
  [
    "connection_lost",
    "The connection was lost before this file was confirmed up. Try it again.",
  ],
] as const)(
  "keeps the failure reason and uses available-original guidance for %s",
  (problemCode, explanation) => {
    const file = {
      ...makeUploadFileFromPosition(0),
      state: "failed" as const,
      problemCode,
    };
    render(
      <MantineProvider>
        <UploadFileRow
          file={file}
          localFile={new File(["photo"], file.originalFilename)}
          isDisabled={false}
          onRetry={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(screen.getByText(explanation)).toBeVisible();
    expect(
      screen.queryByText(/Pick the original again/),
    ).not.toBeInTheDocument();
  },
);

it("keeps reselection guidance when the failed original is unavailable locally", () => {
  render(
    <MantineProvider>
      <UploadFileRow
        file={{
          ...makeUploadFileFromPosition(0),
          state: "failed",
          problemCode: "abandoned",
        }}
        isDisabled={false}
      />
    </MantineProvider>,
  );
  expect(
    screen.getByText(
      "Sending stopped before this file arrived. Pick the original again to resume.",
    ),
  ).toBeVisible();
});

describe("duplicate upload rows", () => {
  it.each(["done", "refused", "cancelled"] as const)(
    "does not offer a retry for a %s original",
    (state) => {
      render(
        <MantineProvider>
          <UploadFileRow
            file={{ ...makeUploadFileFromPosition(0), state }}
            isDisabled={false}
            onRetry={vi.fn()}
          />
        </MantineProvider>,
      );
      expect(
        screen.queryByRole("button", { name: /Retry/ }),
      ).not.toBeInTheDocument();
    },
  );
  it.each([
    [
      "archive",
      "Duplicate: already in the shoebox. This file will be skipped.",
    ],
    [
      "batch",
      "Duplicate: already selected in this batch. This file will be skipped.",
    ],
  ] as const)(
    "restores the %s explanation without local activity",
    (duplicateReason, explanation) => {
      render(
        <MantineProvider>
          <UploadFileRow
            file={{
              ...makeUploadFileFromPosition(0),
              state: "cancelled",
              duplicateReason,
            }}
            isDisabled={false}
            onRetry={vi.fn()}
          />
        </MantineProvider>,
      );
      expect(screen.getByText("Duplicate")).toBeVisible();
      expect(screen.getByText(explanation)).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /Retry/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Pick the original again/),
      ).not.toBeInTheDocument();
    },
  );

  it("explains a live duplicate before its saved row refreshes without claiming an archive match", () => {
    render(
      <MantineProvider>
        <UploadFileRow
          file={makeUploadFileFromPosition(0)}
          activity={{ kind: "duplicate" }}
          isDisabled={false}
          onRetry={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(screen.getByText("Duplicate")).toBeVisible();
    expect(
      screen.getByText("Duplicate file. This file will be skipped."),
    ).toBeVisible();
    expect(
      screen.queryByText(/already in the shoebox/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Retry/ }),
    ).not.toBeInTheDocument();
  });

  it("uses saved duplicate evidence instead of stale transfer and email activity", () => {
    render(
      <MantineProvider>
        <UploadFileRow
          file={{
            ...makeUploadFileFromPosition(0),
            state: "cancelled",
            duplicateReason: "archive",
          }}
          activity={{
            kind: "transferring",
            sentBytes: 5,
            totalBytes: 10,
            isIncludedInEmail: false,
          }}
          isDisabled={false}
        />
      </MantineProvider>,
    );
    expect(screen.getByText("Duplicate")).toBeVisible();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/will appear on its day/),
    ).not.toBeInTheDocument();
  });
});

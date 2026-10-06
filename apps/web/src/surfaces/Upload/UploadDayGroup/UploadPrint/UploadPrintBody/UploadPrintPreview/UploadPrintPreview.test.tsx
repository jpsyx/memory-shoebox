import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeUploadSurfaceDetail } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { UploadPrintPreview } from "./UploadPrintPreview";

describe("draft preview fallback", () => {
  it("does not report a decode failure before local preparation starts", () => {
    render(
      <UploadPrintPreview
        file={makeUploadSurfaceDetail().files[0]!}
        preview={undefined}
        hasLocalFile
      />,
    );
    expect(screen.getByText("Preparing preview")).toBeInTheDocument();
    expect(screen.queryByText("Preview unavailable")).not.toBeInTheDocument();
  });
  it("explains when a restored draft needs the original files again", () => {
    render(
      <UploadPrintPreview
        file={makeUploadSurfaceDetail().files[0]!}
        preview={undefined}
        hasLocalFile={false}
      />,
    );
    expect(
      screen.getByText("Choose the files again to preview"),
    ).toBeInTheDocument();
  });
  it("keeps the unavailable fallback for an actual decoding failure", () => {
    render(
      <UploadPrintPreview
        file={makeUploadSurfaceDetail().files[0]!}
        preview={{ kind: "unavailable" }}
        hasLocalFile
      />,
    );
    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
  });
});

import { createUploadPreviewQueue } from "@/upload/createUploadPreviewQueue/createUploadPreviewQueue";
import { makeUploadFileFromPosition } from "@/upload/createUploadSessionController/__tests__/uploadSurfaceFixtureHelpers";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { UploadPrint } from "./UploadPrint";

it("labels a saved duplicate print without local upload activity", () => {
  const previews = createUploadPreviewQueue();
  const view = render(
    <UploadPrint
      file={{
        ...makeUploadFileFromPosition(0),
        state: "cancelled",
        duplicateReason: "archive",
      }}
      previews={previews}
      labelCount={0}
    />,
  );
  try {
    expect(screen.getByText("Duplicate")).toBeVisible();
    expect(screen.queryByText("Cancelled")).not.toBeInTheDocument();
  } finally {
    view.unmount();
    previews.destroy();
  }
});

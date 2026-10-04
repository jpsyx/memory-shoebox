import { makeUploadControllerHarness } from "@/upload/uploadSessionController/__tests__/uploadControllerTestHelpers";
import { makeUploadSurfaceDetail } from "@/upload/uploadSessionController/__tests__/uploadSurfaceFixtures";
import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { UploadRecoveryChoices } from "./UploadRecoveryChoices";

it.each(["draft", "uploading"] as const)(
  "explains unmatched originals factually in %s",
  async (state) => {
    const { controller } = makeUploadControllerHarness(
      makeUploadSurfaceDetail({ state }),
    );
    await controller.loadSession("018f0000-0000-7000-8000-00000000c001");
    const snapshot = controller.getSnapshot();
    render(
      <MantineProvider>
        <UploadRecoveryChoices
          controller={controller}
          snapshot={{
            ...snapshot,
            recoveryMatches: {
              ...snapshot.recoveryMatches,
              unmatchedClientRefs: ["extra"],
            },
          }}
        />
      </MantineProvider>,
    );
    expect(
      screen.getByText(
        state === "draft"
          ? "Extra chosen files belong to this draft. Review the saved files and retry any interrupted declaration before putting them up."
          : "1 extra chosen files are outside this batch. They have not been sent. Upload them in a new batch after this one ends.",
      ),
    ).toBeVisible();
  },
);

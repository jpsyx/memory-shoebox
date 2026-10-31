import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { makeComment, SIGNED_IN } from "@/testing/itemFixtureHelpers";
import { makeMomentGroupsFromEvents } from "../videoMomentHelpers/videoMomentHelpers";
import { VideoMomentPreview } from "./VideoMomentPreview";
it("carries stored tag wording and native links from the actual timeline grouping into its preview", () => {
  const comment = makeComment({
    body: "Hi @Jorge",
    atSeconds: 4,
    commentTags: [
      {
        memberId: SIGNED_IN.memberId,
        tagId: "saved",
        start: 3,
        end: 9,
        label: "Jorge",
      },
    ],
  });
  const moment = makeMomentGroupsFromEvents({
    comments: [comment],
    reactions: [],
    duration: 60,
  })[0]!.moments[0]!;
  render(
    <MantineProvider>
      <VideoMomentPreview
        moment={moment}
        onSeek={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
      />
    </MantineProvider>,
  );
  expect(
    screen.getByRole("link", { name: "Jorge, view photos and videos" }),
  ).toHaveAttribute("href", `/?member=${SIGNED_IN.memberId}`);
});

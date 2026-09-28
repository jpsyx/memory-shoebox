import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type {
  CommentDto,
  MediaRef,
  MemberRef,
  MilestoneRef,
} from "@memory-shoebox/shared";
import { createRef, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { MilestoneDateFields } from "@/system/MilestoneDates";
import { MilestoneFix } from "@/system/MilestoneFix";
import { CommentRow, Composer, Talk } from "@/system/Talk";
import { VideoFrame } from "@/system/VideoFrame";
import { VisibilityControl } from "@/system/Visibility";
import { cssVariablesResolver, theme } from "@/theme/theme";

function _source(url: string) {
  return {
    url,
    expiresAt: "2026-09-28T13:00:00.000Z",
    width: 800,
    height: 600,
  };
}

const MEDIA: MediaRef = {
  thumb: _source("https://example.test/t.jpg"),
  display: _source("https://example.test/d.jpg"),
  poster: null,
  video: null,
  durationMs: null,
  altText: "Mateo on the day he was born",
};

const VIEWER: MemberRef = { memberId: "m0", displayName: "Papá" };

const COMMENT: CommentDto = {
  commentId: "c1",
  author: { memberId: "m1", displayName: "Abuela Rosa" },
  body: "He has his mother's chin.",
  atSeconds: null,
  createdAt: "2026-09-26T09:00:00.000Z",
  editedAt: null,
  canEdit: false,
  canDelete: false,
  reactions: { kinds: [], myKind: null },
};

const MILESTONE: MilestoneRef = {
  milestoneId: "ms1",
  name: "Mateo is born",
  startsOn: "2026-09-14",
  endsOn: "2026-09-14",
  blurb: null,
};

function _render(node: ReactNode) {
  return render(
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {node}
    </MantineProvider>,
  );
}

describe("the comments panel", () => {
  it("renders a thread with one comment in it", () => {
    _render(
      <Talk heading="What people said">
        <CommentRow comment={COMMENT} viewer={VIEWER} />
      </Talk>,
    );

    expect(screen.getByLabelText("Comments")).toBeVisible();
    expect(screen.getByText("Abuela Rosa")).toBeVisible();
    expect(screen.getByText("He has his mother's chin.")).toBeVisible();
  });

  it("offers no edit or delete to somebody the server said cannot", () => {
    _render(<CommentRow comment={COMMENT} viewer={VIEWER} />);

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("splits the two, because the contract does", () => {
    _render(
      <CommentRow comment={{ ...COMMENT, canEdit: true }} viewer={VIEWER} />,
    );

    expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("renders the composer with Send disabled until there are words", () => {
    _render(<Composer goesTo="This goes to everybody who can see it." />);

    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
  });
});

describe("the visibility control", () => {
  it("renders, and says out loud that an admin sees everything", () => {
    _render(
      <VisibilityControl
        mode="everyone"
        onModeChange={() => {}}
        subjects={[]}
        onSubjectsChange={() => {}}
        members={[]}
        groups={[]}
      />,
    );

    expect(screen.getByText(/An admin sees every item/)).toBeVisible();
  });
});

describe("the video frame", () => {
  it("renders its transport with a clock and a play control", () => {
    _render(
      <VideoFrame
        media={{ ...MEDIA, durationMs: 22_000 }}
        marks={[]}
        videoRef={createRef<HTMLVideoElement>()}
      />,
    );

    expect(screen.getByRole("button", { name: "Play" })).toBeVisible();
    expect(screen.getByText("0:00 / 0:00")).toBeVisible();
  });
});

describe("the milestone span fields", () => {
  it("offers one date by default, and a switch into a span", () => {
    _render(
      <MilestoneDateFields
        span={{ startsOn: "2026-09-14", endsOn: null, isMultiDay: false }}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("It ran over more than one day")).toBeVisible();
    expect(screen.getByText("When it happened")).toBeVisible();
  });
});

describe("the reconciliation sheet", () => {
  it("names the count and offers leaving them alone", () => {
    _render(
      <MilestoneFix
        milestone={MILESTONE}
        strays={[
          { itemId: "i1", media: MEDIA, capturedOn: "2026-09-15" },
          { itemId: "i2", media: MEDIA, capturedOn: "2026-09-16" },
        ]}
      />,
    );

    expect(screen.getByText(/2 sit outside Mateo is born/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Leave them as they are" }),
    ).toBeVisible();
  });
});

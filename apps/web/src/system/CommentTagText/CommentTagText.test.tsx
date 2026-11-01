import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { CommentTagText } from "./CommentTagText";
it("links only stored occurrences using their snapshot wording and an ordinary collection href", () => {
  const memberId = "00000000-0000-4000-8000-000000000001";
  render(
    <CommentTagText
      body="Hi @Jorge and @Jorge <script>"
      commentTags={[
        { memberId, tagId: "saved", start: 3, end: 9, label: "Jorge" },
      ]}
    />,
  );
  expect(
    screen.getByRole("link", { name: "Jorge, view photos and videos" }),
  ).toHaveAttribute("href", `/?member=${memberId}`);
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(document.querySelector("script")).toBeNull();
});

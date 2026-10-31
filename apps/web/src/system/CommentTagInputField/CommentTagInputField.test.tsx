import type { CommentTagFailure } from "@/api/comments/comments";
import { useRef, useState } from "react";
import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { stubFetch } from "@/testing/fetchStubHelpers";
import { CommentTagInputField } from "./CommentTagInputField";
import type { CommentDraft } from "../commentDraftHelpers/commentDraftHelpers";
const member = {
  memberId: "00000000-0000-4000-8000-000000000001",
  displayName: "José María 😀",
  avatar: null,
};
const send = vi.fn();
function Harness({
  initial = { body: "", commentTags: [] },
  tagFailure,
}: {
  initial?: CommentDraft;
  tagFailure?: CommentTagFailure[];
}) {
  const [value, onChange] = useState<CommentDraft>(initial);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <CommentTagInputField
        itemId="photo"
        tagFailure={tagFailure}
        value={value}
        onChange={onChange}
        onSubmit={send}
        fieldRef={fieldRef}
        isSending={false}
      />
      <output data-testid="draft">{JSON.stringify(value)}</output>
    </>
  );
}
function setup() {
  stubFetch({
    "GET /api/items/photo/comment-tag-candidates": {
      status: 200,
      body: { members: [member] },
    },
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MantineProvider>
        <Harness />
      </MantineProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
afterEach(() => {
  vi.unstubAllGlobals();
  send.mockClear();
});
it("selects with a shortcut before sending and restores reference and caret through undo/redo", async () => {
  const user = setup();
  const field = screen.getByRole("textbox");
  await user.type(field, "@");
  await screen.findByRole("option", { name: member.displayName });
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(send).not.toHaveBeenCalled();
  expect(field).toHaveValue("@José María 😀 ");
  expect(screen.getByTestId("draft").textContent).toContain(member.memberId);
  await user.keyboard("{Control>}z{/Control}");
  expect(field).toHaveValue("@");
  expect(screen.getByTestId("draft").textContent).not.toContain(
    member.memberId,
  );
  await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
  expect(field).toHaveValue("@José María 😀 ");
  expect(screen.getByTestId("draft").textContent).toContain(member.memberId);
  expect((field as HTMLTextAreaElement).selectionStart).toBe(15);
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(send).toHaveBeenCalledTimes(1);
});
it("keeps plain pasted names plain and dismisses Escape/Tab without selection", async () => {
  const user = setup();
  const field = screen.getByRole("textbox");
  await user.click(field);
  await user.paste("@José María 😀");
  expect(screen.getByTestId("draft").textContent).not.toContain(
    member.memberId,
  );
  await user.clear(field);
  await user.type(field, "@");
  await screen.findByRole("option");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
  expect(field).toHaveValue("@");
  await user.tab();
  expect(screen.getByTestId("draft").textContent).not.toContain(
    member.memberId,
  );
});
it("does not select or submit during IME composition", async () => {
  const user = setup();
  const field = screen.getByRole("textbox");
  await user.type(field, "@");
  await screen.findByRole("option");
  fireEvent.compositionStart(field);
  fireEvent.keyDown(field, { key: "Enter", ctrlKey: true, isComposing: true });
  expect(field).toHaveValue("@");
  expect(send).not.toHaveBeenCalled();
  fireEvent.compositionEnd(field);
  await waitFor(() => {
    return expect(screen.getByRole("option")).toBeInTheDocument();
  });
});

it("repairs unavailable occurrences as plain text without deleting surrounding words", async () => {
  const initial = {
    body: "Hi @José María 😀!",
    commentTags: [{ memberId: member.memberId, start: 3, end: 17 }],
  };
  stubFetch({
    "GET /api/items/photo/comment-tag-candidates": {
      status: 200,
      body: { members: [] },
    },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider>
        <Harness
          initial={initial}
          tagFailure={[
            {
              occurrence: initial.commentTags[0]!,
              memberId: member.memberId,
              label: member.displayName,
              code: "comment_tag_unavailable",
            },
          ]}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Keep as plain text" }),
  );
  expect(screen.getByRole("textbox")).toHaveValue(initial.body);
  expect(screen.getByTestId("draft").textContent).not.toContain(
    member.memberId,
  );
});
it("refreshes a stale name without changing surrounding words or member identity", async () => {
  const initial = {
    body: "Hi @Old!",
    commentTags: [{ memberId: member.memberId, start: 3, end: 7 }],
  };
  stubFetch({
    "GET /api/items/photo/comment-tag-candidates": {
      status: 200,
      body: { members: [member] },
    },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider>
        <Harness
          initial={initial}
          tagFailure={[
            {
              occurrence: initial.commentTags[0]!,
              memberId: member.memberId,
              label: "Old",
              code: "comment_tag_stale",
            },
          ]}
        />
      </MantineProvider>
    </QueryClientProvider>,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Use updated name" }),
  );
  expect(screen.getByRole("textbox")).toHaveValue("Hi @José María 😀!");
  expect(screen.getByTestId("draft").textContent).toContain(member.memberId);
});

it("keeps a completed newer lookup when an older query finishes late", async () => {
  let finishOld: (response: Response) => void = () => {};
  const old = new Promise<Response>((resolve) => {
    finishOld = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      return String(url).endsWith("q=")
        ? old
        : Promise.resolve(
            new Response(
              JSON.stringify({
                members: [{ ...member, displayName: "Newest result" }],
              }),
              { status: 200 },
            ),
          );
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider>
        <Harness />
      </MantineProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox"), "@");
  await screen.findByText("Finding members...");
  await user.type(screen.getByRole("textbox"), "Ne");
  await screen.findByRole("option", { name: "Newest result" });
  finishOld(
    new Response(
      JSON.stringify({ members: [{ ...member, displayName: "Old result" }] }),
      { status: 200 },
    ),
  );
  await waitFor(() => {
    return expect(
      screen.queryByRole("option", { name: "Old result" }),
    ).not.toBeInTheDocument();
  });
  expect(
    screen.getByRole("option", { name: "Newest result" }),
  ).toBeInTheDocument();
});
it("keeps over-limit member selection intact, explains the excess, and refuses submit", async () => {
  setup();
  const field = screen.getByRole("textbox");
  fireEvent.change(field, {
    target: {
      value: "x".repeat(3997) + " @",
      selectionStart: 3999,
      selectionEnd: 3999,
    },
  });
  await screen.findByRole("option");
  fireEvent.keyDown(field, { key: "Enter" });
  expect((field as HTMLTextAreaElement).value.length).toBeGreaterThan(4000);
  expect(screen.getByRole("alert")).toHaveTextContent(/Remove \d+ characters/);
  fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
  expect(send).not.toHaveBeenCalled();
});
it("cuts and pastes selected text without restoring its tag identity, and undo restores the selection", async () => {
  const user = setup();
  const field = screen.getByRole("textbox") as HTMLTextAreaElement;
  await user.type(field, "@");
  await screen.findByRole("option");
  await user.keyboard("{Enter}");
  field.setSelectionRange(1, 5);
  fireEvent.select(field);
  await user.cut();
  expect(screen.getByTestId("draft").textContent).not.toContain(
    member.memberId,
  );
  await user.keyboard("{Control>}z{/Control}");
  expect(screen.getByTestId("draft").textContent).toContain(member.memberId);
  expect([field.selectionStart, field.selectionEnd]).toEqual([1, 5]);
  await user.copy();
  field.setSelectionRange(field.value.length, field.value.length);
  await user.paste();
  expect(
    JSON.parse(screen.getByTestId("draft").textContent ?? "{}").commentTags,
  ).toHaveLength(1);
});
it("dismisses a no-result shortcut without sending and ordinary Enter inserts a newline", async () => {
  stubFetch({
    "GET /api/items/photo/comment-tag-candidates": {
      status: 200,
      body: { members: [] },
    },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider>
        <Harness />
      </MantineProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  const field = screen.getByRole("textbox");
  await user.type(field, "@");
  await screen.findByText("No members available to tag here.");
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(send).not.toHaveBeenCalled();
  expect(field).toHaveValue("@");
  await user.type(field, "x");
  await screen.findByText("No matching members.");
  await user.keyboard("{Enter}");
  expect(field).toHaveValue("@x\n");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

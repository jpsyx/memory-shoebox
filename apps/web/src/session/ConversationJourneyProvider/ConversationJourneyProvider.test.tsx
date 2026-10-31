import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { createMeResponse } from "@/testing/createMeResponse";
import {
  capturePrivateAuthority,
  isPrivateAuthorityCurrent,
  reconcileAccountFields,
  removePrivateQueries,
} from "@/api/me/privateQueryHelpers";
import {
  ConversationJourneyProvider,
  useConversationJourney,
} from "./ConversationJourneyProvider";
import { EMPTY_CONVERSATION_DRAFT } from "../conversationJourneyHelpers/conversationJourneyHelpers";
const key = { itemId: "item", mode: "main" } as const;
it.each(["account", "session", "query", "private", "signout"])(
  "retires old closures on %s replacement",
  (kind) => {
    const client = new QueryClient();
    client.setQueryData(["me"], createMeResponse());
    const { result } = renderHook(useConversationJourney, {
      wrapper: ({ children }) => {
        return (
          <QueryClientProvider client={client}>
            <ConversationJourneyProvider>
              {children}
            </ConversationJourneyProvider>
          </QueryClientProvider>
        );
      },
    });
    const old = result.current!;
    act(() => {
      return old.writeDraft(key, {
        ...EMPTY_CONVERSATION_DRAFT,
        body: "Private words",
      });
    });
    act(() => {
      if (kind === "private") {
        removePrivateQueries(client);
      }
      if (kind === "query") {
        client.removeQueries({ queryKey: ["me"], exact: true });
        client.setQueryData(["me"], createMeResponse());
      }
      if (kind === "session") {
        client.setQueryData(["me"], {
          ...createMeResponse(),
          sessionId: "00000000-0000-4000-8000-000000000099",
        });
      }
      if (kind === "account") {
        client.setQueryData(["me"], createMeResponse({ memberId: "other" }));
      }
      if (kind === "signout") {
        client.setQueryData(["me"], null);
        client.setQueryData(["me"], createMeResponse());
      }
    });
    expect(result.current!.readDraft(key)).toBeUndefined();
    act(() => {
      result.current!.writeDraft(key, {
        ...EMPTY_CONVERSATION_DRAFT,
        body: "Replacement words",
      });
      old.removeDraft(key);
      old.writeDraft(key, { ...EMPTY_CONVERSATION_DRAFT, body: "Stale words" });
      old.rememberReturn({
        itemId: "item",
        href: "/items/item",
        memberId: "member",
        scrollContainer: "window",
        scrollTop: 3,
        theater: "page",
      });
    });
    expect(result.current!.readDraft(key)?.body).toBe("Replacement words");
    expect(result.current!.readReturn()).toBeUndefined();
    expect(old.readDraft(key)).toBeUndefined();
  },
);
it("survives root StrictMode effect recreation", () => {
  const client = new QueryClient();
  client.setQueryData(["me"], createMeResponse());
  const { result } = renderHook(useConversationJourney, {
    reactStrictMode: true,
    wrapper: ({ children }) => {
      return (
        <QueryClientProvider client={client}>
          <ConversationJourneyProvider>{children}</ConversationJourneyProvider>
        </QueryClientProvider>
      );
    },
  });
  act(() => {
    return result.current!.writeDraft(key, {
      ...EMPTY_CONVERSATION_DRAFT,
      body: "Live words",
    });
  });
  expect(result.current!.readDraft(key)?.body).toBe("Live words");
});
it("preserves this tab when a different device updates the member-global sign-in timestamp", () => {
  const client = new QueryClient();
  const account = createMeResponse();
  client.setQueryData(["me"], account);
  const { result } = renderHook(useConversationJourney, {
    wrapper: ({ children }) => {
      return (
        <QueryClientProvider client={client}>
          <ConversationJourneyProvider>{children}</ConversationJourneyProvider>
        </QueryClientProvider>
      );
    },
  });
  const original = result.current!;
  act(() => {
    return original.writeDraft(key, {
      ...EMPTY_CONVERSATION_DRAFT,
      body: "This tab's words",
    });
  });
  act(() => {
    return client.setQueryData(["me"], {
      ...account,
      me: { ...account.me, lastSignedInAt: "2026-10-31T13:00:00.000Z" },
    });
  });
  expect(result.current!.readDraft(key)?.body).toBe("This tab's words");
  expect(result.current).toBe(original);
});

it.each(["name", "avatar"] as const)(
  "retires drafts and captured actions when a %s response first observes replacement session",
  (field) => {
    const client = new QueryClient();
    const original = createMeResponse();
    client.setQueryData(["me"], original);
    client.setQueryData(["items", "private"], { body: "Old private cache" });
    const { result } = renderHook(useConversationJourney, {
      wrapper: ({ children }) => {
        return (
          <QueryClientProvider client={client}>
            <ConversationJourneyProvider>
              {children}
            </ConversationJourneyProvider>
          </QueryClientProvider>
        );
      },
    });
    const old = result.current!;
    const ticket = capturePrivateAuthority(client);
    act(() => {
      old.writeDraft(key, { ...EMPTY_CONVERSATION_DRAFT, body: "Old words" });
    });
    const replacement = createMeResponse({
      sessionId: "018f0000-0000-7000-8000-000000000099",
      displayName: "Replacement name",
    });
    act(() => {
      reconcileAccountFields(client, replacement, field, ticket);
    });
    expect(client.getQueryData(["me"])).toEqual(replacement);
    expect(client.getQueryData(["items", "private"])).toBeUndefined();
    expect(isPrivateAuthorityCurrent(client, ticket)).toBe(false);
    expect(result.current!.readDraft(key)).toBeUndefined();
    act(() => {
      result.current!.writeDraft(key, {
        ...EMPTY_CONVERSATION_DRAFT,
        body: "New words",
      });
      old.removeDraft(key);
      old.writeDraft(key, { ...EMPTY_CONVERSATION_DRAFT, body: "Stale words" });
      reconcileAccountFields(client, original, field, ticket);
    });
    expect(client.getQueryData(["me"])).toEqual(replacement);
    expect(result.current!.readDraft(key)?.body).toBe("New words");
    expect(old.readDraft(key)).toBeUndefined();
  },
);

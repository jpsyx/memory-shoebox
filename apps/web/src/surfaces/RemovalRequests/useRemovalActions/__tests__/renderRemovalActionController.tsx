import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import { makeRemovalRequestFromOverrides } from "@/testing/askingAndOccasionsFixtureHelpers";
import { renderHookWithQueryClient } from "@/testing/itemWriteTestHelpers";
import type { RemovalRequestDto } from "@memory-shoebox/shared";
import { QueryClient } from "@tanstack/react-query";
import type { RenderHookResult } from "@testing-library/react";
import type { Mock } from "vitest";
import { vi } from "vitest";
import { useRemovalActions } from ".././useRemovalActions";
import type { RemovalActions } from "../useRemovalActions";
/** Shared authoritative fixture for the controller scenarios. */
export const VIEWER = {
  memberId: "member",
  displayName: "Mamá",
  role: "admin",
  isAdmin: true,
} as const satisfies Viewer;

/** Shared authoritative fixture for the controller scenarios. */
export const REQUEST = makeRemovalRequestFromOverrides({
  canDeleteItem: true,
  canDecline: true,
}) satisfies RemovalRequestDto;

/** Shared authoritative fixture for the controller scenarios. */
export const DELETE = `DELETE /api/items/${REQUEST.itemId}` satisfies string;

/** Installs or renders the shared controller test fixture. */
export function renderRemovalActionController(
  onItemDeleted: Mock<(itemId: string) => void> = vi.fn<
    (itemId: string) => void
  >(),
): RenderHookResult<RemovalActions, unknown> & {
  queryClient: QueryClient;
  onItemDeleted: Mock<(itemId: string) => void>;
} {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const hook = renderHookWithQueryClient({
    queryClient,
    useHook: () => {
      return useRemovalActions({ viewer: VIEWER, onItemDeleted });
    },
  });
  return { ...hook, queryClient, onItemDeleted };
}

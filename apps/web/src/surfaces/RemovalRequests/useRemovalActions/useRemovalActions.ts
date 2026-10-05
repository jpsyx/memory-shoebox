import type { Viewer } from "@/session/requireSignedIn/requireSignedIn";
import {
  declineRemovalRequestRequestSchema,
  type RemovalRequestDto,
} from "@memory-shoebox/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  submitRemovalAnswer,
  type RemovalActionContext,
  type RemovalActionState,
} from "./removalActionStateHelpers";
type OpenDialogOptions = {
  request: RemovalRequestDto;
  dialog: "delete" | "decline";
  viewer: Viewer;
  context: RemovalActionContext;
};
type ConfirmDeclineOptions = {
  state: RemovalActionState;
  viewer: Viewer;
  context: RemovalActionContext;
  reason: string;
};

/** Shared controller for request answering and own-request withdrawal. */
export type RemovalActions = {
  target: RemovalRequestDto | undefined;
  dialog: "delete" | "decline" | undefined;
  openDelete: (request: RemovalRequestDto) => void;
  openDecline: (request: RemovalRequestDto) => void;
  close: () => void;
  confirmDelete: () => void;
  confirmDecline: (reason: string) => void;
  withdraw: (request: RemovalRequestDto) => void;
  isPending: boolean;
  error: string | undefined;
  fieldErrors: Record<string, string[]>;
};

function _confirmRemovalDeletion({
  state,
  viewer,
  context,
}: Readonly<{
  state: RemovalActionState;
  viewer: Viewer;
  context: RemovalActionContext;
}>): void {
  if (state.target?.canDeleteItem && state.target.itemId !== null) {
    submitRemovalAnswer({
      context,
      operation: { action: "delete", request: state.target, viewer },
    });
  }
}
function _makeActions(
  options: Readonly<{
    state: RemovalActionState;
    viewer: Viewer;
    context: RemovalActionContext;
  }>,
): RemovalActions {
  const { state, viewer, context } = options;
  return {
    target: state.target,
    dialog: state.dialog,
    isPending: state.isPending,
    error: state.error,
    fieldErrors: state.fieldErrors,
    openDelete: (request) => {
      _openDialog({ ...options, request, dialog: "delete" });
    },
    openDecline: (request) => {
      _openDialog({ ...options, request, dialog: "decline" });
    },
    close: () => {
      if (!context.activeMembers.has(viewer.memberId)) {
        context.setState((current) => {
          return { ...current, dialog: undefined };
        });
      }
    },
    confirmDelete: () => {
      _confirmRemovalDeletion(options);
    },
    confirmDecline: (reason) => {
      _confirmDecline({ ...options, reason });
    },
    withdraw: (request) => {
      if (request.canWithdraw) {
        submitRemovalAnswer({
          context,
          operation: { action: "withdraw", request, viewer },
        });
      }
    },
  };
}

function _openDialog({
  request,
  dialog,
  viewer,
  context,
}: Readonly<OpenDialogOptions>): void {
  if (context.activeMembers.has(viewer.memberId)) {
    return;
  }
  const isAllowed =
    dialog === "delete"
      ? request.canDeleteItem && request.itemId !== null
      : request.canDecline;
  if (isAllowed) {
    context.setState({
      memberId: viewer.memberId,
      target: request,
      dialog,
      isPending: false,
      fieldErrors: {},
    });
  }
}

function _confirmDecline({
  state,
  viewer,
  context,
  reason,
}: Readonly<ConfirmDeclineOptions>): void {
  if (context.activeMembers.has(viewer.memberId)) {
    return;
  }
  const parsed = declineRemovalRequestRequestSchema.safeParse({
    declineReason: reason,
  });
  if (!parsed.success) {
    context.setState((current) => {
      return {
        ...current,
        fieldErrors: { declineReason: ["Say why in 1 to 4,000 characters."] },
      };
    });
    return;
  }
  if (state.target?.canDecline) {
    submitRemovalAnswer({
      context,
      operation: {
        action: "decline",
        request: state.target,
        viewer,
        declineReason: parsed.data.declineReason,
      },
    });
  }
}

/**
 * Captures write identities, blocks double presses, and reconciles uncertainty.
 */
export function useRemovalActions({
  viewer,
  onItemDeleted,
  onRequestSettled,
}: Readonly<{
  viewer: Viewer;
  onItemDeleted?: (itemId: string) => void;
  onRequestSettled?: (request: RemovalRequestDto) => void;
}>): RemovalActions {
  const queryClient = useQueryClient();
  const viewerRef = useRef(viewer.memberId);
  const activeMembers = useRef(new Set<string>()).current;
  const blockedOperations = useRef(new Set<string>()).current;
  const settledRequests = useRef(new Set<string>()).current;
  const [state, setState] = useState<RemovalActionState>({
    memberId: viewer.memberId,
    isPending: false,
    fieldErrors: {},
  });
  viewerRef.current = viewer.memberId;
  const visibleState =
    state.memberId === viewer.memberId
      ? state
      : { memberId: viewer.memberId, isPending: false, fieldErrors: {} };
  return _makeActions({
    state: visibleState,
    viewer,
    context: {
      queryClient,
      viewerRef,
      activeMembers,
      blockedOperations,
      settledRequests,
      setState,
      onItemDeleted,
      onRequestSettled,
    },
  });
}

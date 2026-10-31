import { useEffect, useRef, type RefObject } from "react";
import {
  useMutation,
  type UseMutationResult,
  type QueryClient,
} from "@tanstack/react-query";
import type { MeDto, MeResponse } from "@memory-shoebox/shared";
import {
  publishMemberAvatar,
  getLatestAvatarFromMember,
  removeAvatar,
  saveAvatar,
} from "@/api/avatars/avatars";
import {
  capturePrivateAuthority,
  isPrivateAuthorityCurrent,
} from "@/api/me/privateQueryHelpers";
import { avatarFailure } from "./avatarCropHelpers/avatarCropHelpers";
import type { AvatarEditorOptions, AvatarOperation } from "./avatarEditorTypes";
import type { useAvatarDraft } from "./useAvatarDraft";

type MutationOptions = {
  client: QueryClient;
  authority: ReturnType<typeof capturePrivateAuthority>;
  me: MeDto;
  state: ReturnType<typeof useAvatarDraft>;
  props: AvatarEditorOptions;
};

/** Saves photos independently and fences every UI continuation by lifetime. */
export function useAvatarMutation(
  options: Readonly<MutationOptions>,
): UseMutationResult<
  MeResponse,
  unknown,
  AvatarOperation,
  { ticket: ReturnType<typeof capturePrivateAuthority> }
> {
  const { client, authority } = options;
  const latest = useRef(options);
  latest.current = options;
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  return useMutation({
    mutationKey: ["avatar"],
    meta: { privateAuthority: authority },
    mutationFn: (operation: AvatarOperation) => {
      return _performOperation({ ...latest.current, operation });
    },
    onMutate: () => {
      return { ticket: capturePrivateAuthority(client) };
    },
    onSuccess: _getSuccessAction(latest, isMounted),
    onError: _getFailureAction(latest, isMounted),
  });
}

function _getSuccessAction(
  latest: RefObject<Readonly<MutationOptions>>,
  isMounted: RefObject<boolean>,
) {
  return (
    response: MeResponse,
    operation: AvatarOperation,
    context: { ticket: ReturnType<typeof capturePrivateAuthority> },
  ) => {
    if (
      !isMounted.current ||
      !isPrivateAuthorityCurrent(latest.current.client, context.ticket)
    ) {
      return;
    }
    const { state, props } = latest.current;
    state.clear();
    state.setStatus(
      operation.kind === "remove"
        ? "Photo removed."
        : operation.kind === "latest"
          ? undefined
          : "Photo saved.",
    );
    props.onSaved(response);
  };
}
function _getFailureAction(
  latest: RefObject<Readonly<MutationOptions>>,
  isMounted: RefObject<boolean>,
) {
  return (
    failure: unknown,
    _operation: AvatarOperation,
    context: { ticket: ReturnType<typeof capturePrivateAuthority> } | undefined,
  ) => {
    if (
      !isMounted.current ||
      !context ||
      !isPrivateAuthorityCurrent(latest.current.client, context.ticket)
    ) {
      return;
    }
    const { state, props } = latest.current;
    const message = avatarFailure(failure);
    state.setError(message);
    if (
      message === "Your photo changed in another window." &&
      state.selection
    ) {
      state.setIsOpen(true);
    }
    props.completion?.onFailure();
  };
}

async function _performOperation(
  options: Readonly<MutationOptions & { operation: AvatarOperation }>,
): Promise<MeResponse> {
  const { client, authority, me, operation } = options;
  if (!isPrivateAuthorityCurrent(client, authority)) {
    throw new Error("Account changed.");
  }
  if (operation.kind === "remove") {
    return removeAvatar({
      client,
      expectedAvatarId: operation.expectedAvatarId,
    });
  }
  if (operation.kind === "latest" || operation.kind === "overwrite") {
    const avatar = await getLatestAvatarFromMember({
      client,
      member: me.member,
    });
    if (operation.kind === "latest") {
      publishMemberAvatar(
        client,
        { ...me.member, avatar },
        me.member.avatar?.avatarId ?? null,
      );
      return client.getQueryData<MeResponse>(["me"])!;
    }
    return saveAvatar({
      client,
      file: operation.selection.file,
      crop: operation.crop,
      expectedAvatarId: avatar?.avatarId ?? null,
    });
  }
  return saveAvatar({
    client,
    file: operation.selection.file,
    crop: operation.crop,
    expectedAvatarId: operation.selection.expectedAvatarId,
  });
}

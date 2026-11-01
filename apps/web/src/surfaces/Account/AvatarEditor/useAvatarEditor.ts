import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AvatarCrop, MeDto, MeResponse } from "@memory-shoebox/shared";
import {
  capturePrivateAuthority,
  isPrivateAuthorityCurrent,
} from "@/api/me/privateQueryHelpers";
import { avatarFileError } from "./avatarCropHelpers/avatarCropHelpers";
import type { AvatarEditorOptions } from "./avatarEditorTypes";
import { useAvatarDraft } from "./useAvatarDraft";
import { useAvatarMutation } from "./useAvatarMutation";

type AvatarEditorState = ReturnType<typeof useAvatarDraft> &
  ReturnType<typeof _getActions> & {
    me: MeDto;
    isSaving: boolean;
    onClosed: () => void;
  };

/** Composes the selected photo and its independent account mutation owner. */
export function useAvatarEditor(
  props: Readonly<AvatarEditorOptions>,
): AvatarEditorState {
  const { client, authority, me, account } = useAvatarIdentity(props);
  const state = useAvatarDraft();
  const { clear } = state;
  useEffect(() => {
    if (!isPrivateAuthorityCurrent(client, authority)) {
      clear();
    }
  }, [client, authority, account, clear]);
  const mutation = useAvatarMutation({ client, authority, me, state, props });
  const actions = _getActions({
    state,
    mutation,
    props,
    expectedAvatarId: me.member.avatar?.avatarId ?? null,
  });
  const saveRef = useRef(actions.save);
  saveRef.current = actions.save;
  const onStagedChange = props.completion?.onStagedChange;
  useEffect(() => {
    onStagedChange?.(
      state.selection && state.draft?.isConfirmed
        ? () => {
            return saveRef.current();
          }
        : undefined,
    );
    return () => {
      return onStagedChange?.(undefined);
    };
  }, [onStagedChange, state.selection, state.draft]);
  return {
    ...state,
    ...actions,
    me,
    isSaving: mutation.isPending,
    onClosed: () => {
      const focused = document.activeElement;
      if (focused === document.body || focused?.closest('[role="dialog"]')) {
        state.opener.current?.focus();
      }
    },
  };
}

function useAvatarIdentity(props: Readonly<AvatarEditorOptions>) {
  const client = useQueryClient();
  const authority = useMemo(() => {
    return capturePrivateAuthority(client);
  }, [client]);
  const account = useSyncExternalStore(
    (notify) => {
      return client.getQueryCache().subscribe(notify);
    },
    () => {
      return client.getQueryData<MeResponse | null>(["me"]);
    },
  );
  const me =
    account?.me.member.memberId === props.me.member.memberId
      ? {
          ...account.me,
          member: {
            ...account.me.member,
            displayName: props.completion
              ? props.me.member.displayName
              : account.me.member.displayName,
          },
        }
      : props.me;
  return { client, authority, me, account };
}

type ActionOptions = {
  state: ReturnType<typeof useAvatarDraft>;
  mutation: ReturnType<typeof useAvatarMutation>;
  props: AvatarEditorOptions;
  expectedAvatarId: string | null;
};
function _getActions({
  state,
  mutation,
  props,
  expectedAvatarId,
}: Readonly<ActionOptions>) {
  const { selection, draft } = state;
  const save = () => {
    if (selection && draft && !mutation.isPending) {
      state.setError(undefined);
      mutation.mutate({ kind: "save", selection, crop: draft.crop });
    }
  };
  return {
    save,
    choose: () => {
      return state.input.current?.click();
    },
    cancel: state.clear,
    onFile: _getFileAction(state, expectedAvatarId),
    onCrop: (crop: AvatarCrop) => {
      return state.setDraft((current) => {
        return current ? { ...current, crop } : current;
      });
    },
    onSave: () => {
      if (props.completion && draft) {
        state.setDraft({ ...draft, isConfirmed: true });
        state.setIsOpen(false);
      } else {
        save();
      }
    },
    remove: () => {
      return mutation.mutate({ kind: "remove", expectedAvatarId });
    },
    useLatest: () => {
      return mutation.mutate({ kind: "latest" });
    },
    overwrite: () => {
      if (selection && draft) {
        mutation.mutate({ kind: "overwrite", selection, crop: draft.crop });
      }
    },
  };
}

function _getFileAction(
  state: ReturnType<typeof useAvatarDraft>,
  expectedAvatarId: string | null,
) {
  return (file: File | undefined) => {
    if (!file) {
      return;
    }
    const invalid = avatarFileError(file);
    if (invalid) {
      state.setError(invalid);
      return;
    }
    state.setError(undefined);
    state.setStatus(undefined);
    state.setSelection({
      file,
      url: URL.createObjectURL(file),
      expectedAvatarId,
    });
    state.setIsOpen(true);
  };
}

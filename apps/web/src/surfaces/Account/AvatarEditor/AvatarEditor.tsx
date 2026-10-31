import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { MeDto, MeResponse } from "@memory-shoebox/shared";
import { MemberAvatar } from "@/system/MemberAvatar/MemberAvatar";
import { AvatarCropDialog } from "./AvatarCropDialog/AvatarCropDialog";
import { getPreviewFromAvatarCrop } from "./avatarCropHelpers/avatarCropHelpers";
import { useAvatarEditor } from "./useAvatarEditor";
import type { DeferredAvatarSave } from "./avatarEditorTypes";
import classes from "./AvatarEditor.module.css";

type Props = {
  me: MeDto;
  onSaved: (response: MeResponse) => void;
  completion?: DeferredAvatarSave;
};

/** Independent own-account photo editing with optional deferred completion. */
export function AvatarEditor(props: Readonly<Props>): ReactNode {
  const editor = useAvatarEditor(props);
  const isConflict = editor.error === "Your photo changed in another window.";
  return (
    <Stack gap="sm">
      {_rowFromEditor(editor)}
      {_inputFromEditor(editor)}
      <Text>JPEG, PNG or WebP, up to 10 MB.</Text>
      {props.completion ? <Text>Optional. You can add one later.</Text> : null}
      {editor.status ? <Text role="status">{editor.status}</Text> : null}
      {!editor.isOpen && !editor.isRemoving && editor.error ? (
        <Text role="alert">{editor.error}</Text>
      ) : null}
      <AvatarCropDialog {..._getCropPropsFromEditor(editor, isConflict)} />
      {_removalFromEditor(editor, isConflict)}
    </Stack>
  );
}

function _rowFromEditor(editor: ReturnType<typeof useAvatarEditor>): ReactNode {
  return (
    <>
      <Text fw={600}>Your photo</Text>
      <Group align="center">
        {_previewFromEditor(editor)}
        <Group gap="xs">
          <Button
            ref={editor.opener}
            variant="default"
            onClick={editor.choose}
            disabled={editor.isSaving}
          >
            {editor.me.member.avatar || editor.draft?.isConfirmed
              ? "Change photo"
              : "Add a photo"}
          </Button>
          {editor.me.member.avatar ? (
            <Button
              variant="subtle"
              onClick={() => {
                editor.setError(undefined);
                editor.setIsRemoving(true);
              }}
              disabled={editor.isSaving}
            >
              Remove photo
            </Button>
          ) : null}
        </Group>
      </Group>
    </>
  );
}

function _inputFromEditor(
  editor: ReturnType<typeof useAvatarEditor>,
): ReactNode {
  return (
    <input
      ref={editor.input}
      className={classes.file}
      type="file"
      accept="image/jpeg,image/png,image/webp"
      aria-label="Choose photo file"
      onChange={(event) => {
        editor.onFile(event.currentTarget.files?.[0]);
        event.currentTarget.value = "";
      }}
    />
  );
}

function _getCropPropsFromEditor(
  editor: ReturnType<typeof useAvatarEditor>,
  isConflict: boolean,
) {
  return {
    opened: editor.isOpen,
    url: editor.selection?.url ?? "",
    dimensions: editor.draft,
    crop: editor.draft?.crop ?? { centerX: 0.5, centerY: 0.5, zoom: 1 },
    onCrop: editor.onCrop,
    onSave: editor.onSave,
    onCancel: editor.cancel,
    onClosed: editor.onClosed,
    onChoose: editor.choose,
    isSaving: editor.isSaving,
    error: editor.error,
    onUseLatest: isConflict ? editor.useLatest : undefined,
    onOverwrite: isConflict ? editor.overwrite : undefined,
  };
}

function _removalFromEditor(
  editor: ReturnType<typeof useAvatarEditor>,
  isConflict: boolean,
): ReactNode {
  return (
    <Modal
      opened={editor.isRemoving}
      onClose={() => {
        editor.setIsRemoving(false);
      }}
      title="Remove your photo?"
      returnFocus={false}
      onExitTransitionEnd={editor.onClosed}
      closeOnEscape={!editor.isSaving}
      withCloseButton={!editor.isSaving}
      closeOnClickOutside={false}
      closeButtonProps={{ "aria-label": "Close" }}
    >
      <Stack>
        <Text>Your initials will appear instead.</Text>
        {editor.error ? <Text role="alert">{editor.error}</Text> : null}
        {_removeActionsFromEditor(editor)}
        {isConflict ? (
          <Button onClick={editor.useLatest} disabled={editor.isSaving}>
            Use latest photo
          </Button>
        ) : null}
      </Stack>
    </Modal>
  );
}

function _removeActionsFromEditor(
  editor: ReturnType<typeof useAvatarEditor>,
): ReactNode {
  return (
    <Group>
      <Button
        variant="default"
        data-autofocus
        onClick={() => {
          editor.setIsRemoving(false);
        }}
        disabled={editor.isSaving}
      >
        Keep photo
      </Button>
      <Button onClick={editor.remove} loading={editor.isSaving}>
        Remove photo
      </Button>
    </Group>
  );
}

function _previewFromEditor(
  editor: ReturnType<typeof useAvatarEditor>,
): ReactNode {
  if (!editor.draft?.isConfirmed || !editor.selection) {
    return <MemberAvatar member={editor.me.member} size={80} />;
  }
  const preview = getPreviewFromAvatarCrop({
    ...editor.draft,
    crop: editor.draft.crop,
    size: 80,
  });
  return (
    <span className={classes.staged} aria-hidden="true">
      <img alt="" src={editor.selection.url} style={preview} />
    </span>
  );
}

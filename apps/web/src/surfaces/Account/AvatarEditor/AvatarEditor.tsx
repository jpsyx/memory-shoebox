import { Stack, Text } from "@mantine/core";
import type { MeDto, MeResponse } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { AvatarCropDialog } from "./AvatarCropDialog/AvatarCropDialog";
import { AvatarEditorRow } from "./AvatarEditorRow";
import type { DeferredAvatarSave } from "./avatarEditorTypes";
import { AvatarFileInput } from "./AvatarFileInput";
import { AvatarRemovalDialog } from "./AvatarRemovalDialog";
import { useAvatarEditor } from "./useAvatarEditor";

type Props = {
  me: MeDto;
  onSaved: (response: MeResponse) => void;
  completion?: DeferredAvatarSave;
};

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
/** Independent own-account photo editing with optional deferred completion. */
export function AvatarEditor({
  me,
  onSaved,
  completion,
}: Readonly<Props>): ReactNode {
  const editor = useAvatarEditor({ me, onSaved, completion });
  const isConflict = editor.error === "Your photo changed in another window.";
  return (
    <Stack gap="sm">
      <AvatarEditorRow editor={editor} />
      <AvatarFileInput editor={editor} />
      <Text>JPEG, PNG or WebP, up to 10 MB.</Text>
      {completion ? <Text>Optional. You can add one later.</Text> : null}
      {editor.status ? <Text role="status">{editor.status}</Text> : null}
      {!editor.isOpen && !editor.isRemoving && editor.error ? (
        <Text role="alert">{editor.error}</Text>
      ) : null}
      <AvatarCropDialog {..._getCropPropsFromEditor(editor, isConflict)} />
      <AvatarRemovalDialog editor={editor} isConflict={isConflict} />
    </Stack>
  );
}

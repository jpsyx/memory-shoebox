import { Button, Modal, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { AvatarRemovalActions } from "./AvatarRemovalActions";
import { useAvatarEditor } from "./useAvatarEditor";
type Props = {
  editor: ReturnType<typeof useAvatarEditor>;
  isConflict: boolean;
};
/** Renders the avatar removal dialog controls. */
export function AvatarRemovalDialog({
  editor,
  isConflict,
}: Readonly<Props>): ReactNode {
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
        <AvatarRemovalActions editor={editor} />
        {isConflict ? (
          <Button onClick={editor.useLatest} disabled={editor.isSaving}>
            Use latest photo
          </Button>
        ) : null}
      </Stack>
    </Modal>
  );
}

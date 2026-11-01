import { Button, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { AvatarEditorPreview } from "./AvatarEditorPreview";
import { useAvatarEditor } from "./useAvatarEditor";
type Props = { editor: ReturnType<typeof useAvatarEditor> };
/** Renders the avatar editor row controls. */
export function AvatarEditorRow({ editor }: Readonly<Props>): ReactNode {
  return (
    <>
      <Text fw={600}>Your photo</Text>
      <Group align="center">
        <AvatarEditorPreview editor={editor} />
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

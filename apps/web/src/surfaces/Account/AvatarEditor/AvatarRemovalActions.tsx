import { Button, Group } from "@mantine/core";
import type { ReactNode } from "react";
import { useAvatarEditor } from "./useAvatarEditor";

type Props = { editor: ReturnType<typeof useAvatarEditor> };
/** Renders the avatar removal actions controls. */
export function AvatarRemovalActions({ editor }: Readonly<Props>): ReactNode {
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

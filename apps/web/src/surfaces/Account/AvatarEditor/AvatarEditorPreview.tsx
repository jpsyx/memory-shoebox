import { MemberAvatar } from "@/system/MemberAvatar/MemberAvatar";
import type { ReactNode } from "react";
import { getPreviewFromAvatarCrop } from "./avatarCropHelpers/avatarCropHelpers";
import classes from "./AvatarEditor.module.css";
import { useAvatarEditor } from "./useAvatarEditor";

type Props = { editor: ReturnType<typeof useAvatarEditor> };
/** Renders the avatar editor preview controls. */
export function AvatarEditorPreview({ editor }: Readonly<Props>): ReactNode {
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

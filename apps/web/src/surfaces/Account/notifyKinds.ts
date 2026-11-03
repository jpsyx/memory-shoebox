import type { NotifyPreferences } from "@memory-shoebox/shared";

/** One email category and its explanatory copy. */
export type NotifyKind = Readonly<{
  key: keyof NotifyPreferences;
  label: string;
  note: string;
}>;

/** Activity frequency controls and the separate removal switch. */
export const NOTIFY_KINDS: readonly NotifyKind[] = [
  {
    key: "onUpload",
    label: "New photos/videos",
    note: "New photo and video uploads you can see.",
  },
  {
    key: "onComment",
    label: "Comments and replies",
    note: "Comments on your uploads and conversations you joined.",
  },
  {
    key: "onCommentTag",
    label: "Comment tags",
    note: "When someone uses @ to get your attention.",
  },
  {
    key: "onRemoval",
    label: "Somebody asks for a photograph to come down",
    note: "For uploaders and admins.",
  },
];

/** All email categories off, which is what the bulk button sends. */
export const NOTIFY_NONE: NotifyPreferences = {
  onUpload: "off",
  onComment: "off",
  onRemoval: false,
  onCommentTag: "off",
};

/** The requested defaults restored by the bulk enable button. */
export const NOTIFY_ALL: NotifyPreferences = {
  onUpload: "daily",
  onComment: "daily",
  onRemoval: true,
  onCommentTag: "immediate",
};

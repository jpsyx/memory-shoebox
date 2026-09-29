import type { NotifyPreferences } from "@memory-shoebox/shared";

/** One switch, and the sentence that says what turning it off stops. */
export type NotifyKind = {
  readonly key: keyof NotifyPreferences;
  readonly label: string;
  readonly note: string;
};

/**
 * The four switches, each carrying the sentence that says what it stops.
 *
 * One switch was easier to build and worse to live with: the member who wants
 * the daily upload mail but not the comment threads had exactly one move, and
 * it was to turn the whole thing off and stop coming back.
 */
export const NOTIFY_KINDS: readonly NotifyKind[] = [
  {
    key: "onUpload",
    label: "Somebody puts photographs up",
    note: "One email for the whole batch, however many it was, saying how many of them you can see.",
  },
  {
    key: "onComment",
    label: "Somebody writes on something of yours",
    note: "Only things you uploaded.",
  },
  {
    key: "onReply",
    label: "Somebody writes on something you wrote on",
    note: "So a conversation you joined does not carry on without you.",
  },
  {
    key: "onRemoval",
    label: "Somebody asks for a photograph to come down",
    note: "You get these because you can act on them. A viewer never does.",
  },
];

/** Every switch off, which is what the button sends. */
export const NOTIFY_NONE: NotifyPreferences = {
  onUpload: false,
  onComment: false,
  onReply: false,
  onRemoval: false,
};

/** Every switch on, which is what turning them back on sends. */
export const NOTIFY_ALL: NotifyPreferences = {
  onUpload: true,
  onComment: true,
  onReply: true,
  onRemoval: true,
};

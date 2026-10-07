/** A sample conversation, stored only for the life of the preview. */
export type Comment = {
  id: string;
  name: string;
  initials: string;
  body: string;
  seconds?: number;
  replies: ReadonlyArray<{ id: string; body: string }>;
};
/** A moment-specific response, separate from a reaction on a comment. */
export type Reaction = {
  id: string;
  emoji: string;
  name: string;
  seconds: number;
};
/** Human-readable position in a video. */
export function makeTimestampFromSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
/** Illustrative people and comments, never production family information. */
export const SAMPLE_COMMENTS: readonly Comment[] = [
  {
    id: "c1",
    name: "Grandma",
    initials: "G",
    body: "That little wave! I could watch this all day. ❤️",
    seconds: 2,
    replies: [{ id: "r1", body: "She was waving to you!" }],
  },
  {
    id: "c2",
    name: "Alex",
    initials: "A",
    body: "The most determined little steps.",
    seconds: 5,
    replies: [],
  },
  {
    id: "c3",
    name: "Sam",
    initials: "S",
    body: "And straight back up again 😂",
    seconds: 8,
    replies: [],
  },
];
/** Small initial marker set to make the interaction visible before playback. */
export const SAMPLE_REACTIONS: readonly Reaction[] = [
  { id: "e1", emoji: "😍", name: "Grandma", seconds: 2.8 },
  { id: "e2", emoji: "👏", name: "Alex", seconds: 5.8 },
  { id: "e3", emoji: "❤️", name: "Sam", seconds: 8.7 },
];
/** Emoji choices reproduce the quick-response pattern of Loom. */
export const EMOJIS = [
  { emoji: "😂", label: "Laugh" },
  { emoji: "😍", label: "Love" },
  { emoji: "😮", label: "Wow" },
  { emoji: "🙌", label: "Celebrate" },
  { emoji: "👍", label: "Like" },
  { emoji: "👏", label: "Applaud" },
];

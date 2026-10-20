/** Media in the illustrative timeline, or selected locally by the reviewer. */
export type TheaterMedia = {
  id: string;
  kind: "photo" | "video";
  source: string;
  poster?: string;
  title: string;
  date: string;
  note: string;
};
/** A browser-only comment, optionally attached to a video moment. */
export type TheaterComment = {
  id: string;
  author: string;
  body: string;
  atSeconds?: number;
};
/** Local samples demonstrate mixed media in a single chronological sequence. */
export const SAMPLE_MEDIA: TheaterMedia[] = [
  {
    id: "beach",
    kind: "photo",
    source: new URL("./assets/beach.png", import.meta.url).href,
    title: "One more minute by the water",
    date: "September 14 · 5:42 pm",
    note: "AI-generated sample photograph",
  },
  {
    id: "steps",
    kind: "video",
    source: new URL(
      "../../e2e/fixtures/cartoon-media/web/first-steps.mp4",
      import.meta.url,
    ).href,
    poster: new URL(
      "../../e2e/fixtures/cartoon-media/web/first-steps-poster.jpg",
      import.meta.url,
    ).href,
    title: "A few little steps",
    date: "September 14 · 5:43 pm",
    note: "Generated sample animation · 10 seconds",
  },
  {
    id: "cake",
    kind: "photo",
    source: new URL(
      "../../e2e/fixtures/cartoon-media/web/cake.jpg",
      import.meta.url,
    ).href,
    title: "Save a slice for me",
    date: "September 15 · 3:10 pm",
    note: "Generated sample illustration",
  },
  {
    id: "walk",
    kind: "video",
    source: new URL(
      "../../e2e/fixtures/cartoon-media/web/the-walk.mp4",
      import.meta.url,
    ).href,
    poster: new URL(
      "../../e2e/fixtures/cartoon-media/web/the-walk-poster.jpg",
      import.meta.url,
    ).href,
    title: "Taking the long way home",
    date: "September 15 · 4:28 pm",
    note: "Generated sample animation",
  },
];
/** Illustrative conversation. The prototype never reads family records. */
export const SAMPLE_COMMENTS: Record<string, TheaterComment[]> = {
  beach: [
    {
      id: "a",
      author: "Grandma",
      body: "The kind of afternoon you wish would last forever. ❤️",
    },
    {
      id: "b",
      author: "Alex",
      body: "There was absolutely no convincing them to leave.",
    },
  ],
  steps: [
    {
      id: "c",
      author: "Grandma",
      body: "Look at those little steps!",
      atSeconds: 3,
    },
  ],
};
/** The existing viewer's six quick moment reactions. */
export const REACTIONS = [
  { emoji: "😂", label: "Laugh" },
  { emoji: "😍", label: "Love" },
  { emoji: "😮", label: "Wow" },
  { emoji: "🙌", label: "Celebrate" },
  { emoji: "👍", label: "Like" },
  { emoji: "👏", label: "Applaud" },
];
/** A visible, whole-second video position. */
export function clockLabel(seconds: number): string {
  const position = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(position / 60)}:${String(position % 60).padStart(2, "0")}`;
}

/** Words and their chosen moment travel together when the viewer navigates. */
export type TheaterDraft = {
  body: string;
  atSeconds?: number;
  hasCaptured: boolean;
};

type VisualOccasion = {
  name: string;
  startsOn: string;
  endsOn: string;
  blurb: string;
  itemCount: number;
};
/** Prototype directory content used only by controlled visual states. */
export const VISUAL_OCCASIONS = [
  {
    name: "Mateo is born",
    startsOn: "2026-09-14",
    endsOn: "2026-09-14",
    blurb: "6:41 in the morning, three weeks early and in a hurry.",
    itemCount: 212,
  },
  {
    name: "Home from the hospital",
    startsOn: "2026-09-17",
    endsOn: "2026-09-17",
    blurb: "The car seat took four of us and twenty minutes.",
    itemCount: 46,
  },
  {
    name: "Mateo's first week at home",
    startsOn: "2026-09-17",
    endsOn: "2026-09-21",
    blurb: "Five days of not much happening, which is the whole point.",
    itemCount: 96,
  },
  {
    name: "The week Abuela stayed",
    startsOn: "2026-09-09",
    endsOn: "2026-09-13",
    blurb: "Five days, one suitcase, and an opinion about the pram.",
    itemCount: 318,
  },
  {
    name: "Bisabuela Elena turns eighty",
    startsOn: "2026-08-02",
    endsOn: "2026-08-02",
    blurb: "Nothing attached yet. Marisol has the photographs on her phone.",
    itemCount: 0,
  },
] as const satisfies readonly VisualOccasion[];

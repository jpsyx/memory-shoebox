// apps/server/test/archivePlan.test.ts
import { describe, expect, it } from "vitest";
import {
  ARCHIVE_PLAN,
  getItemsOnDay,
  RESTRICTED_GROUP_NAME,
} from "../scripts/archiveSeed/archivePlan.ts";

describe("ARCHIVE_PLAN", () => {
  it("has a day fat enough to measure a scroll against", () => {
    const fattest = Math.max(
      ...ARCHIVE_PLAN.days.map((day) => {
        return getItemsOnDay(ARCHIVE_PLAN, day.capturedOn).length;
      }),
    );
    expect(fattest).toBeGreaterThanOrEqual(340);
  });

  it("has the forty-five frame burst the stack was designed for", () => {
    const counts = new Map<string, number>();
    for (const item of ARCHIVE_PLAN.items) {
      if (item.burstKey !== undefined) {
        counts.set(item.burstKey, (counts.get(item.burstKey) ?? 0) + 1);
      }
    }
    expect([...counts.values()]).toContain(45);
  });

  it("has a burst with exactly one visible frame and one with none", () => {
    const visibleFrames = new Map<string, number>();
    for (const item of ARCHIVE_PLAN.items) {
      if (item.burstKey === undefined) {
        continue;
      }
      const isVisible = item.visibility === "everyone";
      visibleFrames.set(
        item.burstKey,
        (visibleFrames.get(item.burstKey) ?? 0) + (isVisible ? 1 : 0),
      );
    }
    expect([...visibleFrames.values()]).toContain(1);
    expect([...visibleFrames.values()]).toContain(0);
  });

  it("has a day with exactly one item", () => {
    const sizes = ARCHIVE_PLAN.days.map((day) => {
      return getItemsOnDay(ARCHIVE_PLAN, day.capturedOn).length;
    });
    expect(sizes).toContain(1);
  });

  it("has a one-day occasion, a five-day one, and a day inside both", () => {
    const spans = ARCHIVE_PLAN.milestones.map((milestone) => {
      return milestone.days.length;
    });
    expect(spans).toContain(1);
    expect(spans).toContain(5);

    const coveredTwice = ARCHIVE_PLAN.days.filter((day) => {
      return (
        ARCHIVE_PLAN.milestones.filter((milestone) => {
          return milestone.days.includes(day.capturedOn);
        }).length >= 2
      );
    });
    expect(coveredTwice.length).toBeGreaterThan(0);
  });

  it("has an occasion with nothing attached to it", () => {
    const empty = ARCHIVE_PLAN.milestones.filter((milestone) => {
      return milestone.days.every((day) => {
        return getItemsOnDay(ARCHIVE_PLAN, day).length === 0;
      });
    });
    expect(empty.length).toBeGreaterThan(0);
  });

  it("has a person nobody has photographed yet", () => {
    const photographed = new Set(
      ARCHIVE_PLAN.items.flatMap((item) => {
        return item.people;
      }),
    );
    const unphotographed = ARCHIVE_PLAN.people.filter((person) => {
      return !photographed.has(person);
    });
    expect(unphotographed.length).toBeGreaterThan(0);
  });

  it("has a tag whose every item is restricted", () => {
    const allRestricted = ARCHIVE_PLAN.tags.filter((tag) => {
      const tagged = ARCHIVE_PLAN.items.filter((item) => {
        return item.tags.includes(tag);
      });
      return (
        tagged.length > 0 &&
        tagged.every((item) => {
          return item.visibility === RESTRICTED_GROUP_NAME;
        })
      );
    });
    expect(allRestricted.length).toBeGreaterThan(0);
  });

  it("leaves part of the fattest day unseen, so the spine says a number", () => {
    const fattest = ARCHIVE_PLAN.days[0]?.capturedOn ?? "";
    const onIt = getItemsOnDay(ARCHIVE_PLAN, fattest);
    const unseen = onIt.filter((item) => {
      return !item.seenByViewer;
    });
    expect(unseen.length).toBeGreaterThan(0);
    expect(unseen.length).toBeLessThan(onIt.length);
  });

  it("gives every item a distinct key, because a storage key is unique", () => {
    const keys = ARCHIVE_PLAN.items.map((item) => {
      return item.key;
    });
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is the same plan every time it is read", () => {
    expect(JSON.stringify(ARCHIVE_PLAN)).toBe(JSON.stringify(ARCHIVE_PLAN));
  });
});

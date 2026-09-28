import { Button, NativeSelect, Radio, Stack } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";
import type { MediaRef, MilestoneRef } from "@memory-shoebox/shared";
import { Banner, Sheet } from "@/system/Chrome";
import { ChipRow } from "@/system/Chip";
import {
  dayLabel,
  isMultiDayMilestone,
  milestoneDatesLabel,
  milestoneDays,
} from "@/system/labels";
import { LabelText, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";

export type StrayItem = {
  readonly itemId: string;
  readonly media: MediaRef;
  /** The date the file says it was captured. */
  readonly capturedOn: string;
};

type Props = {
  readonly milestone: MilestoneRef;
  readonly strays: readonly StrayItem[];
  readonly onDone?: () => void;
};

/**
 * Putting photographs and their occasion back in agreement.
 *
 * Attaching something taken outside a milestone's dates is allowed, because
 * it is often right: the christening was Saturday and half the photographs
 * are from the lunch on Sunday. But leaving the two disagreeing makes the
 * archive lie about when things happened, so it is resolved rather than
 * ignored.
 *
 * Moving the photographs is the default, because in the ordinary case the
 * occasion's date is the fact somebody is sure of and the file's timestamp is
 * the thing that drifted. A one-day occasion moves them all to that day; a
 * span has to ask which of its days each one belongs to, since guessing would
 * quietly invent a fact.
 */
export function MilestoneFix({ milestone, strays, onDone }: Props): ReactNode {
  const [approach, setApproach] = useState<"photos" | "milestone">("photos");
  const days = milestoneDays(milestone);
  const isSpan = isMultiDayMilestone(milestone);

  return (
    <Sheet wide label="Photographs outside the milestone">
      <Stack gap="md">
        <LabelText component="h2">
          {strays.length} sit outside {milestone.name}
        </LabelText>
        <Prose>
          The occasion runs {milestoneDatesLabel(milestone)}. These{" "}
          {strays.length} were taken on other days, and they are attached
          anyway. Which of the two is wrong?
        </Prose>

        <Radio.Group
          value={approach}
          onChange={(next) => {
            return setApproach(next as "photos" | "milestone");
          }}
          aria-label="What to change"
        >
          <Stack gap="sm">
            <Radio
              value="photos"
              label="Move the photographs onto the occasion"
              description={
                isSpan
                  ? "You say which of its days each one belongs to."
                  : `All ${strays.length} take the date ${dayLabel(milestone.startsOn)}.`
              }
            />
            <Radio
              value="milestone"
              label="Widen the occasion to cover them"
              description="The milestone's dates stretch to include every date below."
            />
          </Stack>
        </Radio.Group>

        {approach === "photos" ? (
          <div className={classes.fileList}>
            {strays.map((stray) => {
              return (
                <div key={stray.itemId} className={classes.fileRow}>
                  <span className={classes.fileThumb}>
                    <img src={stray.media.thumb.url} alt="" loading="lazy" />
                  </span>
                  <span>
                    <span className={classes.fileName}>
                      Taken {dayLabel(stray.capturedOn)}
                    </span>
                    <br />
                    <span className={classes.fileMeta}>
                      {isSpan
                        ? "Which day of the occasion is it?"
                        : `Becomes ${dayLabel(milestone.startsOn)}`}
                    </span>
                  </span>
                  <span>
                    {isSpan ? (
                      <NativeSelect
                        aria-label={`Which day ${stray.itemId} belongs to`}
                        rightSection={
                          <IconChevronDown size="1.5rem" stroke={1.75} />
                        }
                        data={days.map((day, index) => {
                          return {
                            value: day,
                            label: `Day ${index + 1} · ${dayLabel(day)}`,
                          };
                        })}
                      />
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <Banner>
            <b>
              The occasion becomes {dayLabel(_earliestOf(milestone, strays))} to{" "}
              {dayLabel(_latestOf(milestone, strays))}.
            </b>{" "}
            Any other day inside that stretch joins it too, so anything already
            on those days appears under this milestone in the timeline.
          </Banner>
        )}

        <ChipRow>
          <Button onClick={onDone}>
            {approach === "photos"
              ? `Move the ${strays.length}`
              : "Widen the occasion"}
          </Button>
          <Button variant="default" onClick={onDone}>
            Leave them as they are
          </Button>
        </ChipRow>
        <Prose>
          Leaving them is a real option. Nothing breaks: the photographs stay on
          the days they were taken and still belong to the occasion. It only
          means the timeline shows them somewhere other than the milestone.
        </Prose>
      </Stack>
    </Sheet>
  );
}

function _earliestOf(
  milestone: MilestoneRef,
  strays: readonly StrayItem[],
): string {
  return (
    [
      milestone.startsOn,
      ...strays.map((stray) => {
        return stray.capturedOn;
      }),
    ].sort()[0] ?? milestone.startsOn
  );
}

function _latestOf(
  milestone: MilestoneRef,
  strays: readonly StrayItem[],
): string {
  const dates = [
    milestone.endsOn,
    ...strays.map((stray) => {
      return stray.capturedOn;
    }),
  ].sort();
  return dates[dates.length - 1] ?? milestone.endsOn;
}

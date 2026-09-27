import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { useState, type ReactNode } from "react";
import {
  PILE_MODES,
  RENDITIONS,
  usePileMode,
  useRendition,
  type PileMode,
  type Rendition,
} from "@/harness/rendition";
import type { Surface, SurfaceState } from "@/surfaces/registry";
import classes from "@/harness/harness.module.css";

/**
 * The harness rail.
 *
 * Fixed to the foot of the window and chip black at every rendition, so it
 * never reads as part of the world it is showing. It holds the thing a review
 * actually needs: which surface this is, which of its states is on screen,
 * and the two switches that let the alternatives be compared.
 */
export function Rail({
  surface,
  state,
}: {
  readonly surface?: Surface;
  readonly state?: SurfaceState;
}): ReactNode {
  const [rendition, setRendition] = useRendition();
  const [pileMode, setPileMode] = usePileMode();
  const [isOpen, setIsOpen] = useState(true);

  if (!isOpen) {
    return (
      <div className={clsx(classes.rail, classes.railCollapsed)}>
        <button
          type="button"
          className={classes.railButton}
          onClick={() => {
            return setIsOpen(true);
          }}
        >
          Show the harness
        </button>
      </div>
    );
  }

  return (
    <div className={classes.rail}>
      <div className={classes.railGroup}>
        <Link to="/" className={classes.railButton}>
          All surfaces
        </Link>
        {surface === undefined ? null : (
          <span className={classes.railHere}>
            {surface.number}. {surface.title}
          </span>
        )}
      </div>

      {surface === undefined ? null : (
        <div className={classes.railGroup}>
          <span className={classes.railLabel}>State</span>
          {surface.states.map((candidate) => {
            return (
              <Link
                key={candidate.id}
                to="/s/$surfaceId"
                params={{ surfaceId: surface.id }}
                search={{ state: candidate.id }}
                className={clsx(
                  classes.railButton,
                  candidate.id === state?.id && classes.railButtonOn,
                )}
              >
                {candidate.label}
              </Link>
            );
          })}
        </div>
      )}

      <div className={clsx(classes.railGroup, classes.railGroupEnd)}>
        <span className={classes.railLabel}>Palette</span>
        {RENDITIONS.map((candidate) => {
          return (
            <button
              key={candidate}
              type="button"
              className={clsx(
                classes.railButton,
                candidate === rendition && classes.railButtonOn,
              )}
              onClick={() => {
                return setRendition(candidate as Rendition);
              }}
            >
              {candidate}
            </button>
          );
        })}
      </div>

      <div className={classes.railGroup}>
        <span className={classes.railLabel}>Pile</span>
        {PILE_MODES.map((candidate) => {
          return (
            <button
              key={candidate}
              type="button"
              className={clsx(
                classes.railButton,
                candidate === pileMode && classes.railButtonOn,
              )}
              onClick={() => {
                return setPileMode(candidate as PileMode);
              }}
            >
              {candidate}
            </button>
          );
        })}
        <button
          type="button"
          className={classes.railButton}
          onClick={() => {
            return setIsOpen(false);
          }}
        >
          Hide
        </button>
      </div>

      {state === undefined ? null : (
        <p className={classes.railNote}>{state.note}</p>
      )}
    </div>
  );
}

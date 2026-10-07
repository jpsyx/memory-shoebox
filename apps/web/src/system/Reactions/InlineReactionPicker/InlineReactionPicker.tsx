import { Popover } from "@mantine/core";
import { IconChevronDown, IconHeart } from "@tabler/icons-react";
import { useId, type ReactNode } from "react";
import type { ReactionKind } from "@memory-shoebox/shared";
import { getReactionEntryFromKind } from "../reactionEntries";
import { ReactionBar, REACTION_EMOJIS } from "../ReactionBar/ReactionBar";
import { useReactionBar } from "./useReactionBar";
import classes from "./InlineReactionPicker.module.css";

type Props = {
  chosen: ReactionKind | null;
  onChoose: (kind: ReactionKind | null) => void;
};

/** One click loves a comment; a short hover or explicit action opens its bar. */
export function InlineReactionPicker({
  chosen,
  onChoose,
}: Readonly<Props>): ReactNode {
  const bar = useReactionBar();
  const chooserId = useId();
  const word =
    chosen === null ? "React" : getReactionEntryFromKind(chosen).word;
  const choose = (kind: ReactionKind | null) => {
    bar.close();
    onChoose(kind);
  };
  return (
    <Popover
      opened={bar.isOpen}
      onClose={bar.close}
      position="top-start"
      offset={6}
      withinPortal
      trapFocus={bar.isPinned}
      returnFocus={bar.isPinned}
      shadow="md"
      transitionProps={{
        transition: "pop-bottom-left",
        duration: 180,
        timingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <Popover.Target>
        <div
          className={classes.inlineReactionPickerTrigger}
          onPointerEnter={bar.onPointerEnter}
          onPointerLeave={bar.onPointerLeave}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              bar.open();
            }
          }}
        >
          <button
            type="button"
            className={classes.inlineReactionPickerAction}
            aria-label={
              chosen === null ? "React with Love" : `Remove ${word} reaction`
            }
            aria-pressed={chosen !== null}
            onClick={() => {
              choose(chosen === null ? "love" : null);
            }}
          >
            {chosen === null ? (
              <IconHeart size={16} aria-hidden="true" />
            ) : (
              <span aria-hidden="true">{REACTION_EMOJIS[chosen]}</span>
            )}
            {word}
          </button>
          <button
            type="button"
            className={classes.inlineReactionPickerExpand}
            id={chooserId}
            aria-label="Choose a reaction"
            aria-haspopup="dialog"
            aria-expanded={bar.isOpen}
            onClick={(event) => {
              event.currentTarget.focus();
              if (bar.isOpen) {
                bar.close();
              } else {
                bar.open();
              }
            }}
          >
            <IconChevronDown size={12} aria-hidden="true" />
          </button>
        </div>
      </Popover.Target>
      <Popover.Dropdown
        className={classes.inlineReactionPickerDropdown}
        aria-label="Choose a reaction"
        aria-labelledby={chooserId}
        onPointerEnter={bar.hold}
        onPointerLeave={bar.onPointerLeave}
      >
        <ReactionBar chosen={chosen} onChoose={choose} />
      </Popover.Dropdown>
    </Popover>
  );
}

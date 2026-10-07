import type {
  CommentDto,
  ItemDetail,
  VisibilitySummary,
} from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { dayLabel } from "@/system/labelHelpers/labelHelpers";

/**
 * Every sentence surfaces 3 and 4 say that depends on the item, in one file.
 *
 * A photograph and a video share one route and one set of sheets, and the
 * only difference most sentences carry is the noun. Keeping them together is
 * what stops "photograph" surviving on a video's delete button.
 */

/** Which of the two an item is. */
type ItemKind = ItemDetail["kind"];

/** "photograph" or "video": the noun every kind-aware sentence turns on. */
export function kindNoun(kind: ItemKind): string {
  return kind === "photo" ? "photograph" : "video";
}

/** The page's own heading, for a screen reader. Visually hidden. */
export function itemHeading(
  options: Readonly<{ kind: ItemKind; capturedOn: string }>,
): string {
  return `A ${kindNoun(options.kind)} from ${dayLabel(options.capturedOn)}`;
}

/** The thread's heading: a count, and on a video how many are pinned. */
export function commentsHeading(
  options: Readonly<{ kind: ItemKind; comments: readonly CommentDto[] }>,
): string {
  const { kind, comments } = options;
  if (comments.length === 0) {
    return "Nothing said yet";
  }
  const said =
    comments.length === 1 ? "1 comment" : `${comments.length} comments`;
  const pinnedCount = comments.filter((comment) => {
    return comment.atSeconds !== null;
  }).length;
  return kind === "video" && pinnedCount > 0
    ? `${said}, ${pinnedCount} pinned to a moment`
    : said;
}

/** How long a rate-limited caller must wait, in words. */
function _wait(error: ApiRequestError): string {
  const retryAfterSeconds = error.details?.retryAfterSeconds;
  if (retryAfterSeconds === undefined) {
    return "a minute";
  }
  // Rounded up, and never below one.
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  return seconds === 1 ? "a second" : `${seconds} seconds`;
}

/**
 * A write on this page that did not land.
 *
 * A `403` says the viewer can no longer make this change. The page refetches
 * once to update its controls.
 */
export function itemWriteFailure(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 403) {
    return "You can no longer change this one.";
  }
  if (error instanceof ApiRequestError && error.code === "rate_limited") {
    return `That did not go through: a lot has been sent from here just now. Wait ${_wait(error)} and try again.`;
  }
  return "That did not go through. Try again.";
}

/** A comment that did not send. Its words are still in the field. */
export function commentSendFailure(error: unknown): string {
  return error instanceof ApiRequestError && error.code === "rate_limited"
    ? `It did not send: a lot has been said from here just now. Wait ${_wait(error)} and send it again. It is still here.`
    : "It did not send. It is still here, so try again.";
}

/** A reaction that did not land, which the control has already put back. */
export const REACTION_FAILURE =
  "That reaction did not go through, so it has been put back. Try again.";

/** The delete dialog: what is destroyed, and what goes with it. */
export function deleteItemProse(commentCount: number): string {
  const commentsClause =
    commentCount === 0
      ? ""
      : commentCount === 1
        ? ", and the one comment on it goes with it"
        : `, and the ${commentCount} comments on it go with it`;
  return `It goes for good: the record and the file behind it. Nobody in the Shoebox will be able to open it again${commentsClause}.`;
}

/** Under the delete button: why this viewer may. */
export function deleteReasonProse(isUploader: boolean): string {
  return isUploader
    ? "You uploaded this one, so you can take it down."
    : "You run the archive, so you can take it down.";
}

/** Under "Ask for this to come down": who is told. */
export function removalAskProse(uploaderName: string): string {
  return `You are tagged in this one. Asking tells ${uploaderName}, who put it up, and everyone who runs the archive.`;
}

/**
 * Under the visibility sentence. "Everyone else" means nothing for everyone.
 */
export function visibilityProse(
  options: Readonly<{ kind: ItemKind; mode: VisibilitySummary["mode"] }>,
): string {
  return options.mode === "everyone"
    ? "Everybody in the Shoebox can open it."
    : `To everyone else this ${kindNoun(options.kind)} is not there at all.`;
}

/**
 * Under the people field once it holds as many as one item can carry. The
 * number is `LIMITS.itemMaxPeople` in words.
 */
export function peopleCapProse(kind: ItemKind): string {
  return `Thirty people is as many as one ${kindNoun(kind)} can carry.`;
}

/**
 * Under the tags field once it holds as many as one item can carry. The
 * number is `LIMITS.itemMaxTags` in words.
 */
export function tagsCapProse(kind: ItemKind): string {
  return `Fifty tags is as many as one ${kindNoun(kind)} can carry.`;
}

/** Where the capture date came from, which is not always the file. */
const SOURCE_SENTENCE: Record<ItemDetail["captureSource"], string> = {
  exif: "Date from the file.",
  video_metadata: "Date from the file.",
  filename: "Date from the filename.",
  file_mtime: "Date from when the file was last saved.",
  uploader_set: "Date set by hand.",
  upload_time: "No capture date found. Using the upload date.",
};

/** Under the capture date: where it came from. */
export function captureSourceProse(
  captureSource: ItemDetail["captureSource"],
): string {
  return SOURCE_SENTENCE[captureSource];
}

/** What leaving a burst costs, for the date warning. */
export function burstLeavingProse(visibleFrameCount: number): string {
  const otherCount = visibleFrameCount - 1;
  return otherCount === 1
    ? "The other one stays where it is."
    : `The other ${otherCount} stay where they are.`;
}

/**
 * Under the description field.
 *
 * `generated` is `media.altText` while no override exists, which is then the
 * composed line; once an override exists the client no longer holds the
 * composed line, so the sentence describes it rather than quoting it.
 */
export function describeProse(
  options: Readonly<{ draft: string; generated: string | undefined }>,
): string {
  if (options.draft.trim().length > 0) {
    return "Read aloud instead of the automatic description.";
  }
  return options.generated === undefined
    ? "Left empty, the description uses tagged people and the capture date."
    : `Left empty, this one reads as “${options.generated}”.`;
}

/** The "not here" state, identical for a deleted and an invisible item. */
export const NOT_HERE_HEADING = "This one is not here.";

/** Under it. The same words for both causes, because the 404 is the same. */
export const NOT_HERE_PROSE =
  "It may have been taken down, or it was never shared with you.";

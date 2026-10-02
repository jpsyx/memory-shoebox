import type {
  CommentDto,
  ItemDetail,
  VisibilitySummary,
} from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/client/client";
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
export function itemHeading(options: {
  kind: ItemKind;
  capturedOn: string;
}): string {
  return `A ${kindNoun(options.kind)} from ${dayLabel(options.capturedOn)}`;
}

/** The thread's heading: a count, and on a video how many are pinned. */
export function commentsHeading(options: {
  kind: ItemKind;
  comments: readonly CommentDto[];
}): string {
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

/** What an empty thread says. The composer under it is the surface. */
export function quietThreadProse(kind: ItemKind): string {
  return kind === "photo"
    ? "Nobody has written on this one yet. Anybody who can see it can be the first."
    : "Nobody has written on this one. Anything said here can stand at a moment in the video, or just at the bottom like an ordinary comment.";
}

/**
 * Under Send. Nothing in the payload counts an audience and the client cannot
 * expand a rule, so it names none (decision 11).
 */
export const COMPOSER_HINT = "Everyone who can see this one can read it.";

/** Under the reaction on the photograph or the video itself. */
export function reactionHint(kind: ItemKind): string {
  return kind === "photo"
    ? "A reaction is the whole of what most people will ever leave, and that is plenty. Nobody is emailed about one."
    : "One tap. For most of the people here it is the whole of what they will ever leave, and it is enough.";
}

/** Seconds in words, rounded up and never below one. */
function _seconds(retryAfterSeconds: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  return seconds === 1 ? "a second" : `${seconds} seconds`;
}

/** How long a rate-limited caller must wait, in words. */
function _wait(error: ApiRequestError): string {
  return error.details?.retryAfterSeconds === undefined
    ? "a minute"
    : _seconds(error.details.retryAfterSeconds);
}

/**
 * A write on this page that did not land.
 *
 * A `403` is the server saying the viewer's rights changed underneath the
 * page, and the page refetches once to catch up (decision 12), so the
 * sentence says it has.
 */
export function itemWriteFailure(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 403) {
    return "You can no longer change this one. The page has caught up with what you may do.";
  }
  if (error instanceof ApiRequestError && error.code === "rate_limited") {
    return `That did not go through: a lot has been sent from here just now. Wait ${_wait(error)} and try again.`;
  }
  return "That did not go through. Try again.";
}

/** A comment that did not send. Its words are still in the field. */
export function commentSendFailure(error: unknown): string {
  if (error instanceof ApiRequestError && error.code === "rate_limited") {
    return `It did not send: a lot has been said from here just now. Wait ${_wait(error)} and send it again. It is still here.`;
  }
  return "It did not send. It is still here, so try again.";
}

/** A reaction that did not land, which the control has already put back. */
export const REACTION_FAILURE =
  "That reaction did not go through, so it has been put back. Try again.";

/** The delete dialog: what is destroyed, and what goes with it. */
export function deleteItemProse(options: { commentCount: number }): string {
  const { commentCount } = options;
  const comments =
    commentCount === 0
      ? ""
      : commentCount === 1
        ? ", and the one comment on it goes with it"
        : `, and the ${commentCount} comments on it go with it`;
  return `It goes for good: the record and the file behind it. Nobody in the Shoebox will be able to open it again${comments}.`;
}

/** Under the delete button: why this viewer may. */
export function deleteReasonProse(options: { isUploader: boolean }): string {
  return options.isUploader
    ? "You uploaded this one, so you can take it down. Deleting removes the file as well as the record."
    : "You run the archive, so you can take it down. Deleting removes the file as well as the record.";
}

/** Under "Ask for this to come down": who is told. */
export function removalAskProse(uploaderName: string): string {
  return `You are tagged in this one. Asking tells ${uploaderName}, who put it up, and everyone who runs the archive.`;
}

/** Under the visibility sentence. "Everyone else" means nothing for everyone. */
export function visibilityProse(options: {
  kind: ItemKind;
  mode: VisibilitySummary["mode"];
}): string {
  return options.mode === "everyone"
    ? "Everybody in the Shoebox can open it."
    : `To everyone else this ${kindNoun(options.kind)} is not there at all, and it is not counted in the day's total.`;
}

/** Under the people and tags. */
export function peopleTagProse(kind: ItemKind): string {
  return `A tag on a person says who is in the ${kindNoun(kind)}. It never says who may open it.`;
}

/** Where the capture date came from, which is not always the file. */
const SOURCE_SENTENCE: Record<ItemDetail["captureSource"], string> = {
  exif: "Read off the file itself.",
  video_metadata: "Read off the file itself.",
  filename: "Read off the file's name.",
  file_mtime:
    "Taken from when the file was last saved, because it carried no date of its own.",
  uploader_set: "Put right by hand.",
  upload_time: "The file said nothing, so this is when it was uploaded.",
};

/** Under the capture date: where it came from, and why it matters. */
export function captureSourceProse(options: {
  kind: ItemKind;
  captureSource: ItemDetail["captureSource"];
}): string {
  const noun = kindNoun(options.kind);
  return `${SOURCE_SENTENCE[options.captureSource]} Cameras with a flat battery and scans of old prints get this wrong, and a ${noun} on the wrong day is a ${noun} nobody finds again.`;
}

/** What leaving a burst costs, for the date warning. */
export function burstLeavingProse(visibleFrameCount: number): string {
  const otherCount = visibleFrameCount - 1;
  const others =
    otherCount === 1
      ? "The other one stays where it is."
      : `The other ${otherCount} stay where they are.`;
  return `A burst is a run of frames from one moment, so a frame on another day is not part of it any more. ${others}`;
}

/**
 * Under the description field.
 *
 * `generated` is `media.altText` while no override exists, which is then the
 * composed line; once an override exists the client no longer holds the
 * composed line, so the sentence describes it rather than quoting it.
 */
export function describeProse(options: {
  draft: string;
  generated: string | undefined;
}): string {
  if (options.draft.trim().length > 0) {
    return "That is what gets read out. It replaces what we worked out on our own.";
  }
  return options.generated === undefined
    ? "Left empty, this one reads as a line built from who is tagged in it and when it was taken."
    : `Left empty, this one reads as “${options.generated}”, built from who is tagged in it and when it was taken. That is honest and it is usually enough, which is the point: nobody is going to describe a whole upload by hand.`;
}

/** The "not here" state, identical for a deleted and an invisible item. */
export const NOT_HERE_HEADING = "This one is not here.";

/** Under it. The same words for both causes, because the 404 is the same. */
export const NOT_HERE_PROSE =
  "It may have been taken down, or it was never shared with you. Either way there is nothing at this address for you to open.";

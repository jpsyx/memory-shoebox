import type { ReactNode } from "react";
import type { ItemDetail, SetCaptureDateRequest } from "@memory-shoebox/shared";
import type { WallClock } from "@/system/labelHelpers/labelHelpers";
import { EditorSaveRow } from "@/surfaces/Item/EditorSaveRow";
import type { ItemWrite } from "@/surfaces/Item/itemWrites/useItemDetailWrite/useItemDetailWrite";

type Props = {
  /** The correction, owned by the editor so its fields can wait on it. */
  write: ItemWrite<SetCaptureDateRequest>;
  detail: ItemDetail;
  /** The capture's wall clock now, which the time field started from. */
  wallClock: WallClock;
  /** The day the field holds now, `YYYY-MM-DD`. */
  day: string;
  /** The time the field holds now, `HH:MM`, or empty while it is cleared. */
  time: string;
  onDone: () => void;
};

/**
 * The capture date editor's write: a "Put it right" that asks nothing when
 * neither field changed, and a Cancel.
 *
 * The time is sent only when it changed, so the server keeps the clock time
 * the file carried, seconds and all, and invents nothing (`items.md`
 * § The capture date, step 2).
 */
export function CaptureDateSaveRow({
  write,
  detail,
  wallClock,
  day,
  time,
  onDone,
}: Readonly<Props>): ReactNode {
  const isUnchanged = day === detail.capturedOn && time === wallClock.time;
  const variables =
    time === wallClock.time
      ? { capturedOn: day }
      : { capturedOn: day, capturedTime: time };

  return (
    <EditorSaveRow
      error={write.error}
      isSaving={write.isSaving}
      isSaveDisabled={time === ""}
      saveLabel="Put it right"
      savingLabel="Putting it right"
      onSave={() => {
        if (isUnchanged) {
          onDone();
          return;
        }
        write.save({ variables, onSuccess: onDone });
      }}
      onCancel={onDone}
    />
  );
}

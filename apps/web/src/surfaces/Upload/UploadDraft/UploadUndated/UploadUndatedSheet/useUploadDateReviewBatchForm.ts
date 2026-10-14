import type {
  UploadDateChoice,
  UploadSessionController,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { UploadDateReview } from "@/upload/getUploadDateReviewFromDetail/getUploadDateReviewFromDetail";
import { calendarDateSchema } from "@memory-shoebox/shared";
import { useRef, useState } from "react";

type ConfirmationForm = {
  error: string | undefined;
  isPending: boolean;
  isValid: boolean;
  onSubmit: () => Promise<void>;
};

function useConfirmAllDates(
  options: Readonly<{
    choices: readonly UploadDateChoice[];
    controller: UploadSessionController;
    isDisabled: boolean;
  }>,
): ConfirmationForm {
  const [error, setError] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const pending = useRef(false);
  const isValid =
    options.choices.length > 0 &&
    options.choices.every((choice) => {
      return calendarDateSchema.safeParse(choice.capturedOn).success;
    });
  const onSubmit = async () => {
    if (pending.current || options.isDisabled || !isValid) {
      return;
    }
    pending.current = true;
    setIsPending(true);
    setError(undefined);
    const focusedControl = document.activeElement;
    try {
      await options.controller.amendDates(options.choices);
      if (
        !focusedControl?.isConnected &&
        document.activeElement === document.body
      ) {
        document.getElementById("upload-start")?.focus();
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      pending.current = false;
      setIsPending(false);
    }
  };
  return { error, isPending, isValid, onSubmit };
}

/** Shares edited days between individual saves and the whole review queue. */
export function useUploadDateReviewBatchForm(
  options: Readonly<{
    rows: readonly UploadDateReview[];
    controller: UploadSessionController;
    isDisabled: boolean;
  }>,
): ConfirmationForm & {
  chosenDays: Record<string, string>;
  setChosenDay: (choice: Readonly<UploadDateChoice>) => void;
} {
  const [chosenDays, setChosenDays] = useState<Record<string, string>>({});
  const choices = options.rows.map((row) => {
    return {
      fileId: row.file.fileId,
      capturedOn: chosenDays[row.file.fileId] ?? row.capturedOn,
    };
  });
  const confirmation = useConfirmAllDates({ ...options, choices });
  const setChosenDay = (choice: Readonly<UploadDateChoice>) => {
    setChosenDays((days) => {
      return { ...days, [choice.fileId]: choice.capturedOn };
    });
  };
  return { ...confirmation, chosenDays, setChosenDay };
}

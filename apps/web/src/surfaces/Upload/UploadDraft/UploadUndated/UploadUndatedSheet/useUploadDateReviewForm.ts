import type { UploadSessionController } from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { UploadDateReview } from "@/upload/getUploadDateReviewFromDetail/getUploadDateReviewFromDetail";
import { calendarDateSchema } from "@memory-shoebox/shared";
import { useRef, useState, type RefObject } from "react";

function _getFocusTarget(
  form: HTMLFormElement | null,
): HTMLElement | undefined {
  const rows = [
    ...(form?.parentElement?.querySelectorAll<HTMLFormElement>("form") ?? []),
  ];
  const position = rows.indexOf(form!);
  return (
    rows[position + 1]?.querySelector<HTMLInputElement>("input") ??
    rows[position - 1]?.querySelector<HTMLInputElement>("input") ??
    document.getElementById("upload-start") ??
    undefined
  );
}

async function _saveDateAndRestoreFocus(
  options: Readonly<{
    form: HTMLFormElement | null;
    controller: UploadSessionController;
    fileId: string;
    capturedOn: string;
  }>,
): Promise<void> {
  const hadFocus = options.form?.contains(document.activeElement);
  const focusTarget = _getFocusTarget(options.form);
  await options.controller.amendDates([
    { fileId: options.fileId, capturedOn: options.capturedOn },
  ]);
  if (hadFocus && document.activeElement === document.body) {
    focusTarget?.focus();
  }
}

/** Retains one edited day and its error until the server confirms that file. */
export function useUploadDateReviewForm(
  options: Readonly<{
    row: UploadDateReview;
    controller: UploadSessionController;
    isDisabled: boolean;
  }>,
): {
  capturedOn: string;
  setChosenDay: (day: string) => void;
  error: string | undefined;
  isPending: boolean;
  isValid: boolean;
  onSubmit: () => Promise<void>;
  formRef: RefObject<HTMLFormElement | null>;
} {
  const [chosenDay, setChosenDay] = useState<string>();
  const [error, setError] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const pending = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const capturedOn = chosenDay ?? options.row.capturedOn;
  const isValid = calendarDateSchema.safeParse(capturedOn).success;
  const onSubmit = async () => {
    if (pending.current || options.isDisabled || !isValid) {
      return;
    }
    pending.current = true;
    setIsPending(true);
    setError(undefined);
    try {
      await _saveDateAndRestoreFocus({
        form: formRef.current,
        controller: options.controller,
        fileId: options.row.file.fileId,
        capturedOn,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      pending.current = false;
      setIsPending(false);
    }
  };
  return {
    capturedOn,
    setChosenDay,
    error,
    isPending,
    isValid,
    onSubmit,
    formRef,
  };
}

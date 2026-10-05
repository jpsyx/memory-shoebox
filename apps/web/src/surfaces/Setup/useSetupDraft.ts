import type { SetupDraft } from "./setupFlow.types";
import { useState } from "react";
import type { CreateSetupRequest } from "@memory-shoebox/shared";
import {
  focusSetupField,
  getSetupFieldsFromBrowser,
  type SetupFieldErrors,
} from "./setupFormHelpers";

/** Local edits and address review survive Back without any server write. */
export function useSetupDraft(): SetupDraft {
  const [fields, setFields] = useState(getSetupFieldsFromBrowser);
  const [errors, setErrors] = useState<SetupFieldErrors>({});
  const [review, setReview] = useState<CreateSetupRequest>();
  const onInvalid = (fieldErrors: SetupFieldErrors) => {
    setErrors(fieldErrors);
    setReview(undefined);
    requestAnimationFrame(() => {
      return focusSetupField(fieldErrors);
    });
  };
  const onChange = (field: keyof typeof fields, value: string) => {
    setFields({ ...fields, [field]: value });
    setErrors({ ...errors, [field]: undefined });
    setReview(undefined);
  };
  return {
    fields,
    errors,
    review,
    onInvalid,
    onChange,
    onEdit: () => {
      return setReview(undefined);
    },
    onReviewed: (body: CreateSetupRequest) => {
      setErrors({});
      setReview(body);
    },
  };
}

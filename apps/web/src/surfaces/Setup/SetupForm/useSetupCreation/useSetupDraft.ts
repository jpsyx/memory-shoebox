import type { CreateSetupRequest } from "@memory-shoebox/shared";
import { useState } from "react";
import type { SetupDraft } from "../../setupFlow.types";
import {
  focusSetupField,
  getSetupFieldsFromBrowser,
  type SetupFieldErrors,
} from "../../setupFormHelpers";

/** Local edits and address review survive Back without any server write. */
export function useSetupDraft(): SetupDraft {
  const [fields, setFields] = useState(getSetupFieldsFromBrowser);
  const [errors, setErrors] = useState<SetupFieldErrors>({});
  const [review, setReview] = useState<CreateSetupRequest>();
  const onInvalid = (fieldErrors: Readonly<SetupFieldErrors>) => {
    setErrors(fieldErrors);
    setReview(undefined);
    requestAnimationFrame(() => {
      return focusSetupField(fieldErrors);
    });
  };
  return {
    fields,
    errors,
    review,
    onInvalid,
    onChange: ({ field, value }) => {
      setFields({ ...fields, [field]: value });
      setErrors({ ...errors, [field]: undefined });
      setReview(undefined);
    },
    onEdit: () => {
      return setReview(undefined);
    },
    onReviewed: (body) => {
      setErrors({});
      setReview(body);
    },
  };
}

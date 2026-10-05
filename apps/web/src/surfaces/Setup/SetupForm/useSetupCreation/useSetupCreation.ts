import type { SetupCreation } from "../../setupFlow.types";
import { makeSetupRequestValidationFromFields } from "../../setupFormHelpers";
import { useCreateAdmin } from "./useCreateAdmin/useCreateAdmin";
import { useSetupDraft } from "./useSetupDraft";
/**
 * Local review and server creation, with session recovery after a lost reply.
 */
export function useSetupCreation(): SetupCreation {
  const draft = useSetupDraft();
  const creation = useCreateAdmin(draft.onInvalid);
  const onSubmit = () => {
    if (creation.isPending) {
      return;
    }
    if (draft.review !== undefined) {
      creation.create(draft.review);
      return;
    }
    const result = makeSetupRequestValidationFromFields(draft.fields);
    if (!result.success) {
      draft.onInvalid(
        Object.fromEntries(
          result.error.issues.map((issue) => {
            return [issue.path.join("."), issue.message];
          }),
        ),
      );
      return;
    }
    draft.onReviewed(result.data);
  };
  return { ...draft, ...creation, onSubmit };
}

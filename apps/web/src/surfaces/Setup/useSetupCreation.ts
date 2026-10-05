import type { SetupCreation } from "./setupFlow.types";
import { useRef, useState } from "react";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { CreateSetupRequest, MeResponse } from "@memory-shoebox/shared";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { meQueryOptions } from "@/api/me/me";
import {
  createSetup,
  setupStatusQueryOptions,
  setupProgressQueryOptions,
} from "@/api/setup/setup";
import {
  getSetupRequestFromFields,
  type SetupFieldErrors,
} from "./setupFormHelpers";
import { useSetupDraft } from "./useSetupDraft";

async function _createOrRecoverSetup(
  body: Readonly<CreateSetupRequest>,
  client: QueryClient,
): Promise<MeResponse | null> {
  try {
    const created = await createSetup(body);
    return { me: created.me, settings: created.settings };
  } catch (failure: unknown) {
    if (
      failure instanceof ApiRequestError &&
      failure.code !== "setup_already_completed"
    ) {
      throw failure;
    }
    try {
      const account = await client.fetchQuery({
        ...meQueryOptions,
        staleTime: 0,
      });
      const status = await client.fetchQuery(setupStatusQueryOptions);
      if (!status.isRequired) {
        return account;
      }
    } catch {
      /* Recovery failure leaves the original failure for retry. */
    }
    throw failure;
  }
}
function useCreationFailure(onInvalid: (errors: SetupFieldErrors) => void) {
  const [error, setError] = useState<string>();
  const onError = (failure: unknown) => {
    if (
      failure instanceof ApiRequestError &&
      failure.code === "invalid_request"
    ) {
      const errors = Object.fromEntries(
        Object.entries(failure.details?.fieldErrors ?? {}).map(
          ([field, messages]) => {
            return [field, messages[0]];
          },
        ),
      );
      if (Object.keys(errors).length > 0) {
        onInvalid(errors);
        return;
      }
    }
    setError(
      "Could not create your Shoebox. Check your connection and try again.",
    );
  };
  return {
    error,
    onError,
    clearError: () => {
      setError(undefined);
    },
  };
}
function useCreateAdmin(onInvalid: (errors: SetupFieldErrors) => void) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const refusal = useCreationFailure(onInvalid);
  const isCreating = useRef(false);
  const mutation = useMutation({
    mutationFn: (body: CreateSetupRequest) => {
      return _createOrRecoverSetup(body, client);
    },
    onSuccess: async (account) => {
      client.setQueryData(meQueryOptions.queryKey, account);
      client.setQueryData(setupStatusQueryOptions.queryKey, {
        isRequired: false,
      });
      await client.invalidateQueries({
        queryKey: setupProgressQueryOptions.queryKey,
      });
      await navigate({
        to: account === null ? "/sign-in" : "/",
        replace: true,
      });
    },
    onError: refusal.onError,
    onSettled: () => {
      isCreating.current = false;
    },
  });
  const create = (body: CreateSetupRequest) => {
    if (isCreating.current) {
      return;
    }
    isCreating.current = true;
    refusal.clearError();
    mutation.mutate(body);
  };
  return { create, isPending: mutation.isPending, error: refusal.error };
}
/** Local review and server creation, with session recovery after a lost reply. */
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
    const result = getSetupRequestFromFields(draft.fields);
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

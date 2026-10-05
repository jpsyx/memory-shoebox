import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { meQueryOptions } from "@/api/me/me";
import {
  createSetup,
  setupProgressQueryOptions,
  setupStatusQueryOptions,
} from "@/api/setup/setup";
import type { CreateSetupRequest, MeResponse } from "@memory-shoebox/shared";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import type { SetupCreation, SetupDraft } from "../../../setupFlow.types";
import { useCreationFailure } from "./useCreationFailure";

async function _createOrRecoverSetup(
  options: Readonly<{ body: CreateSetupRequest; client: QueryClient }>,
): Promise<MeResponse | undefined> {
  const { body, client } = options;
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
        return account ?? undefined;
      }
    } catch {
      // Recovery failure leaves the original failure for retry.
    }
    throw failure;
  }
}

/** Creates the administrator and restores the session after a lost reply. */
export function useCreateAdmin(
  onInvalid: SetupDraft["onInvalid"],
): Pick<SetupCreation, "create" | "isPending" | "error"> {
  const client = useQueryClient();
  const navigate = useNavigate();
  const refusal = useCreationFailure(onInvalid);
  const isCreating = useRef(false);
  const mutation = useMutation({
    mutationFn: (body: CreateSetupRequest) => {
      return _createOrRecoverSetup({ body, client });
    },
    onSuccess: async (account) => {
      client.setQueryData(meQueryOptions.queryKey, account ?? null);
      client.setQueryData(setupStatusQueryOptions.queryKey, {
        isRequired: false,
      });
      await client.invalidateQueries({
        queryKey: setupProgressQueryOptions.queryKey,
      });
      await navigate({
        to: account === undefined ? "/sign-in" : "/",
        replace: true,
      });
    },
    onError: refusal.onError,
    onSettled: () => {
      isCreating.current = false;
    },
  });
  const create = (body: Readonly<CreateSetupRequest>) => {
    if (isCreating.current) {
      return;
    }
    isCreating.current = true;
    refusal.clearError();
    mutation.mutate(body);
  };
  return { create, isPending: mutation.isPending, error: refusal.error };
}

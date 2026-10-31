import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  useRef,
  useState,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { MeResponse, UpdateMeRequest } from "@memory-shoebox/shared";
import { deleteSession } from "@/api/auth/auth";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { meQueryOptions, updateMe } from "@/api/me/me";
import { getAuthorityFromAccount } from "@/api/me/privateQueryHelpers";
import { makeSafeHrefFromRedirect } from "@/surfaces/SignIn/makeSafeHrefFromRedirect/makeSafeHrefFromRedirect";
import { profileNameError, profileNameFailure } from "../profileNameCopy";

/** Account authority and destination owned by the completion route. */
export type ProfileCompletionOptions = {
  account: MeResponse;
  redirect?: string;
  onContinue: (href: string) => void;
};

type SaveOptions = ProfileCompletionOptions & {
  onError: (message: string) => void;
  onExpired: () => void;
};

function useCompletionSave(options: Readonly<SaveOptions>) {
  const client = useQueryClient();
  const authority = getAuthorityFromAccount(options.account);
  return useMutation({
    scope: { id: "me" },
    mutationFn: updateMe,
    onSuccess: (updated) => {
      const current = client.getQueryData(meQueryOptions.queryKey);
      if (getAuthorityFromAccount(current ?? undefined) !== authority) return;
      client.setQueryData(meQueryOptions.queryKey, updated);
      options.onContinue(makeSafeHrefFromRedirect(options.redirect));
    },
    onError: (failure) => {
      const current = client.getQueryData(meQueryOptions.queryKey);
      if (getAuthorityFromAccount(current ?? undefined) !== authority) return;
      if (failure instanceof ApiRequestError && failure.status === 401) {
        options.onExpired();
        client.clear();
        const destination = makeSafeHrefFromRedirect(options.redirect);
        options.onContinue(
          `/sign-in?redirect=${encodeURIComponent(destination)}&expired=true`,
        );
        return;
      }
      options.onError(profileNameFailure(failure));
    },
  });
}

function useCompletionSignOut(
  options: Readonly<
    ProfileCompletionOptions & { onError: (message: string) => void }
  >,
) {
  const client = useQueryClient();
  return useMutation({
    scope: { id: "me" },
    mutationFn: deleteSession,
    onSuccess: () => {
      client.clear();
      options.onContinue(
        `/sign-in?redirect=${encodeURIComponent(makeSafeHrefFromRedirect(options.redirect))}`,
      );
    },
    onError: () => {
      options.onError("Couldn't sign out. Try again.");
    },
  });
}

/** The completion form state and its independent account mutations. */
type ProfileCompletionFlow = {
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  error: string | undefined;
  input: RefObject<HTMLInputElement | null>;
  submit: () => void;
  mutation: UseMutationResult<MeResponse, Error, UpdateMeRequest>;
  signOut: UseMutationResult<void, Error, void>;
};

/** Keeps failed drafts editable and fences saves by the current account. */
export function useProfileCompletion(
  options: Readonly<ProfileCompletionOptions>,
): ProfileCompletionFlow {
  const [name, setName] = useState(
    options.account.me.suggestedDisplayName ?? "",
  );
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const refuse = (message: string) => {
    setError(message);
    input.current?.focus();
  };
  const mutation = useCompletionSave({
    ...options,
    onError: refuse,
    onExpired: () => {
      return setName("");
    },
  });
  const signOut = useCompletionSignOut({ ...options, onError: refuse });
  const submit = () => {
    const invalid = profileNameError(name);
    setError(invalid);
    if (invalid) {
      refuse(invalid);
      return;
    }
    mutation.mutate({ displayName: name.trim() });
  };
  return { name, setName, error, input, submit, mutation, signOut };
}

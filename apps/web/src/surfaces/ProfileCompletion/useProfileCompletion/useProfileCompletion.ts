import { deleteSession } from "@/api/auth/auth";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { updateMe } from "@/api/me/me";
import {
  capturePrivateAuthority,
  isPrivateAuthorityCurrent,
  reconcileAccountFields,
  type PrivateAuthority,
} from "@/api/me/privateQueryHelpers";
import { makeSafeHrefFromRedirect } from "@/surfaces/SignIn/makeSafeHrefFromRedirect/makeSafeHrefFromRedirect";
import type { MeResponse, UpdateMeRequest } from "@memory-shoebox/shared";
import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
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
  return useMutation({
    scope: { id: "me" },
    mutationFn: async ({
      body,
      ticket,
    }: {
      body: UpdateMeRequest;
      ticket: PrivateAuthority;
    }) => {
      if (!isPrivateAuthorityCurrent(client, ticket)) {
        return undefined;
      }
      return updateMe(body);
    },
    onSuccess: (updated, { ticket }) => {
      if (!updated || !isPrivateAuthorityCurrent(client, ticket)) {
        return;
      }
      reconcileAccountFields(client, updated, "name", ticket);
      options.onContinue(makeSafeHrefFromRedirect(options.redirect));
    },
    onError: (failure, { ticket }) => {
      if (!isPrivateAuthorityCurrent(client, ticket)) {
        return;
      }
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
  mutation: ReturnType<typeof useCompletionSave>;
  signOut: UseMutationResult<void, Error, void>;
};

/** Keeps failed drafts editable and fences saves by the current account. */
export function useProfileCompletion(
  options: Readonly<ProfileCompletionOptions>,
): ProfileCompletionFlow {
  const client = useQueryClient();
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
    mutation.mutate({
      body: { displayName: name.trim() },
      ticket: capturePrivateAuthority(client),
    });
  };
  return { name, setName, error, input, submit, mutation, signOut };
}

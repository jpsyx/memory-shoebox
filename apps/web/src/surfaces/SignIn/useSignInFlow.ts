import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import type { MeResponse } from "@memory-shoebox/shared";
import { createSession, requestSignInCode } from "@/api/auth/auth";
import { meQueryOptions } from "@/api/me/me";
import { setFirstSignIn } from "@/session/firstSignIn/firstSignIn";
import { makeSafeHrefFromRedirect } from "@/surfaces/SignIn/makeSafeHrefFromRedirect/makeSafeHrefFromRedirect";
import {
  signInFailure,
  type SignInFailure,
} from "@/surfaces/SignIn/signInCopy/signInCopy";
import type { SignInState } from "@/surfaces/SignIn/signInState";

/**
 * How either call reports back into the surface, and what it needs to make
 * the call at all.
 *
 * The address is in here rather than read from the URL, because the copy and
 * the request are both about what was typed: the `202` echoes an address back
 * but it proves nothing, being the caller's own input.
 */
type SignInReport = {
  email: string;
  setState: (state: SignInState) => void;
  setCode: (code: string) => void;
  setFailure: (failure: SignInFailure | undefined) => void;
};

/** Everything the card and its form read and drive. */
export type SignInFlow = {
  state: SignInState;
  email: string;
  code: string;
  failure: SignInFailure | undefined;
  /** Whether the code field is showing, which is also which call submits. */
  wantsCode: boolean;
  isBusy: boolean;
  setEmail: (email: string) => void;
  setCode: (code: string) => void;
  onSubmit: () => void;
  onResend: () => void;
};

/** Which state the surface opens in, from the URL alone. */
function _getStateFromSearch(search: {
  redirect?: string;
  sent?: boolean;
}): SignInState {
  if (search.sent === true) {
    return "sent";
  }
  return search.redirect === undefined ? "email" : "link";
}

/**
 * Asking for a code, first time or again, and recording that it was asked.
 *
 * Not exported, and so it would carry the leading underscore the naming rules
 * give a private top-level helper, except that React's rules of hooks are
 * enforced by name: a function calling a hook has to begin with `use` or the
 * linter cannot tell a hook from an ordinary call. The rule that is checked
 * mechanically wins.
 */
function useMintCode(options: Readonly<SignInReport>) {
  const { email, setState, setCode, setFailure } = options;
  const search = useSearch({ from: "/sign-in" });
  const navigate = useNavigate({ from: "/sign-in" });

  return useMutation({
    mutationFn: (isResend: boolean) => {
      return requestSignInCode({ email, isResend });
    },
    onSuccess: (_response, isResend) => {
      setFailure(undefined);
      setCode("");
      setState(isResend ? "resent" : "sent");
      // `replace`, so the back button leaves the flow rather than stepping
      // back inside it to a state whose code has already been superseded.
      void navigate({
        search: { ...search, email, sent: true },
        replace: true,
      });
    },
    onError: (error: unknown) => {
      setFailure(signInFailure({ error, action: "mint" }));
    },
  });
}

/** Turning six digits into a session, and going wherever the link pointed. */
function useRedeemCode(options: Readonly<SignInReport & { code: string }>) {
  const { email, code, setState, setCode, setFailure } = options;
  const search = useSearch({ from: "/sign-in" });
  const navigate = useNavigate({ from: "/sign-in" });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      return createSession({ email, code });
    },
    onSuccess: (created) => {
      // The guard reads this entry on the very next navigation, so it is
      // written rather than invalidated: a refetch here would be a second
      // round trip for an answer already in hand.
      const account: MeResponse = {
        me: created.me,
        settings: created.settings,
      };
      queryClient.setQueryData(meQueryOptions.queryKey, account);
      setFirstSignIn(created.isFirstSignIn);
      void navigate({
        href: makeSafeHrefFromRedirect(search.redirect),
        replace: true,
      });
    },
    onError: (error: unknown) => {
      const refusal = signInFailure({ error, action: "redeem" });
      setFailure(refusal);
      if (refusal.nextState !== undefined) {
        setState(refusal.nextState);
      }
      if (refusal.nextState === "resent") {
        // The server has already minted a replacement, so the digits in the
        // field are not just wrong, they are for a code that no longer exists.
        setCode("");
      }
    },
  });
}

/**
 * Surface 1's state machine: which of the six states it is in, what has been
 * typed, what was refused, and the two calls that move it.
 *
 * **The state is in the URL, and that is not incidental.** Reload this page
 * mid-flow with the state in React alone and the address is gone, so the
 * person retypes it, presses the only button on the surface, and mints a
 * fresh code that stops the one already sitting in their inbox from working.
 * The URL survives a reload and a back button, so the URL is what this opens
 * from.
 *
 * There are six states and not the seven the design spec's table lists, for
 * the reason `signInState.ts` gives: `unknown` is not something this surface
 * can know.
 *
 * @returns The state, the two fields, and the handlers that move them.
 */
export function useSignInFlow(): SignInFlow {
  const search = useSearch({ from: "/sign-in" });
  const [email, setEmail] = useState(search.email ?? "");
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<SignInFailure | undefined>(undefined);
  const [state, setState] = useState<SignInState>(_getStateFromSearch(search));

  const report = { email, setState, setCode, setFailure };
  const mint = useMintCode(report);
  const redeem = useRedeemCode({ ...report, code });
  const wantsCode = state !== "email" && state !== "link";

  return {
    state,
    email,
    code,
    failure,
    wantsCode,
    isBusy: mint.isPending || redeem.isPending,
    setEmail,
    setCode,
    onSubmit: () => {
      if (wantsCode) {
        redeem.mutate();
      } else {
        mint.mutate(false);
      }
    },
    onResend: () => {
      mint.mutate(true);
    },
  };
}

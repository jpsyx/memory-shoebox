import type { MeResponse } from "@memory-shoebox/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useRef, useState } from "react";
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
 * How anything that changes the surface reports back into it.
 *
 * Three setters rather than a reducer, because the surface has three
 * independent facts and no transition that has to read two of them at once.
 */
type SignInSetters = {
  setState: (state: SignInState) => void;
  setCode: (code: string) => void;
  setFailure: (failure: SignInFailure | undefined) => void;
};

/**
 * Surface 1 as a component can use it.
 *
 * Which of the six states it is in, what is in the two fields, whichever
 * refusal is showing and under which control it belongs, and the four things
 * a person can do. **No raw setters**: each handler is the whole of what that
 * action means, and two of them mean considerably more than storing a string.
 * Nothing that renders has to know `SignInFailure` has a `field`, or that
 * changing the address throws a code away.
 */
export type SignInFlow = {
  state: SignInState;
  email: string;
  code: string;
  emailError: string | undefined;
  codeError: string | undefined;
  formError: string | undefined;
  /** Whether the code field is showing, which is also which call submits. */
  wantsCode: boolean;
  isBusy: boolean;
  onEmailChange: (email: string) => void;
  onCodeChange: (code: string) => void;
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
 * The one refusal, put under the control it belongs to.
 *
 * Here rather than in the form, so that knowledge of `SignInFailure`'s shape
 * stays in one place instead of being rebuilt at each of three call sites.
 */
function _getFailureSlots(failure: SignInFailure | undefined) {
  return {
    emailError: failure?.field === "email" ? failure.message : undefined,
    codeError: failure?.field === "code" ? failure.message : undefined,
    formError: failure?.field === "form" ? failure.message : undefined,
  };
}

/** A turn to make a call, and the means of giving it back. */
type OneCallAtATime = {
  /**
   * Claims the turn: true when this call may go out, false when one is
   * already in flight and this one must not. It latches as it answers, the
   * way `takeFirstSignIn` does, so two callers in one tick cannot both be
   * told yes.
   */
  takeTurn: () => boolean;
  /** Gives the turn back. Goes on the mutation's `onSettled`. */
  onSettled: () => void;
};

/**
 * One call in flight at a time, however fast the press.
 *
 * **A ref rather than `isPending`**, because `isPending` is a snapshot of the
 * render a click was bound in: two clicks landing before React re-renders
 * both read `false` from it, and the disabled attribute Mantine puts on a
 * loading button is read from that same render. A ref is read at the moment
 * of the call.
 *
 * Both of this surface's calls need it, and neither is merely wasting a
 * request. A second mint supersedes the code already sitting in somebody's
 * inbox. A second redemption spends a second of the three tries that code
 * has, and three is the number that invalidates it outright and mints a
 * replacement: one accidental double tap is a third of the way to stopping
 * the email in front of them from working.
 */
function useOneCallAtATime(): OneCallAtATime {
  const isInFlight = useRef(false);
  return {
    takeTurn: () => {
      if (isInFlight.current) {
        return false;
      }
      isInFlight.current = true;
      return true;
    },
    onSettled: () => {
      isInFlight.current = false;
    },
  };
}

/**
 * Asking for a code, first time or again, and recording that it was asked.
 *
 * One at a time: a second mint stops the code in the first email from
 * working, and costs two of the five mints an address gets in an hour.
 *
 * Not exported, and so it would carry the leading underscore the naming rules
 * give a private top-level helper, except that React's rules of hooks are
 * enforced by name: a function calling a hook has to begin with `use` or the
 * linter cannot tell a hook from an ordinary call. The rule that is checked
 * mechanically wins.
 */
function useMintCode(options: Readonly<SignInSetters & { email: string }>) {
  const { email, setState, setCode, setFailure } = options;
  const search = useSearch({ from: "/sign-in" });
  const navigate = useNavigate({ from: "/sign-in" });
  const turn = useOneCallAtATime();

  const mutation = useMutation({
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
    onSettled: turn.onSettled,
  });

  const requestCode = (isResend: boolean) => {
    if (turn.takeTurn()) {
      mutation.mutate(isResend);
    }
  };

  return { requestCode, isPending: mutation.isPending };
}

/**
 * Turning six digits into a session, and going wherever the link pointed.
 *
 * One at a time, for the same reason minting is: a code gets three tries
 * before the server invalidates it and sends a replacement, so a double tap
 * spends a third of them and brings the email in front of somebody a third of
 * the way to being dead.
 */
function useRedeemCode(
  options: Readonly<SignInSetters & { email: string; code: string }>,
) {
  const { email, code, setState, setCode, setFailure } = options;
  const search = useSearch({ from: "/sign-in" });
  const navigate = useNavigate({ from: "/sign-in" });
  const queryClient = useQueryClient();
  const turn = useOneCallAtATime();

  const mutation = useMutation({
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
    onSettled: turn.onSettled,
  });

  const redeemCode = () => {
    if (turn.takeTurn()) {
      mutation.mutate();
    }
  };

  return { redeemCode, isPending: mutation.isPending };
}

/**
 * Changing the address, which is more than storing a string.
 *
 * **A live code belongs to the address it was sent to.** So an address that
 * has just been edited has no code, and the surface goes back to asking for
 * one: the button's words change from "Open the photos" to "Email me a code"
 * the moment the address does, which says what pressing it will do. Without
 * this, correcting a typo after a wrong-code refusal leaves the surface in
 * redeem mode and submits the new address with the old code, and the server's
 * refusal reads as another wrong code rather than as a code for somebody
 * else.
 *
 * `sent` leaves the URL for the same reason, so that a reload agrees with
 * what is on the screen.
 */
function useEmailChange(
  options: Readonly<
    SignInSetters & { setEmail: (email: string) => void; wantsCode: boolean }
  >,
) {
  const { setEmail, setState, setCode, setFailure, wantsCode } = options;
  const search = useSearch({ from: "/sign-in" });
  const navigate = useNavigate({ from: "/sign-in" });

  return (nextEmail: string) => {
    setEmail(nextEmail);
    // Every refusal this surface can show was about the address as it stood,
    // so none of them still describes what is now in the box.
    setFailure(undefined);
    if (!wantsCode) {
      return;
    }
    setState("email");
    setCode("");
    void navigate({
      search: { ...search, email: nextEmail, sent: undefined },
      replace: true,
    });
  };
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

  const wantsCode = state !== "email" && state !== "link";
  const setters = { setState, setCode, setFailure };
  const mint = useMintCode({ ...setters, email });
  const redeem = useRedeemCode({ ...setters, email, code });
  const onEmailChange = useEmailChange({ ...setters, setEmail, wantsCode });

  return {
    state,
    email,
    code,
    ..._getFailureSlots(failure),
    wantsCode,
    isBusy: mint.isPending || redeem.isPending,
    onEmailChange,
    onCodeChange: (nextCode: string) => {
      setCode(nextCode);
      // The digits the refusal was about are not the digits in the box any
      // more. Only the code's own refusal goes: an address that is wrong is
      // still wrong.
      if (failure?.field === "code") {
        setFailure(undefined);
      }
    },
    onSubmit: () => {
      if (wantsCode) {
        redeem.redeemCode();
      } else {
        mint.requestCode(false);
      }
    },
    onResend: () => {
      mint.requestCode(true);
    },
  };
}

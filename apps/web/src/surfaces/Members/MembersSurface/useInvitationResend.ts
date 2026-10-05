import type { AdminMemberDto } from "@memory-shoebox/shared";
import { useState } from "react";
import { useInterval } from "@mantine/hooks";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { useMemberMutation } from "@/surfaces/Members/useMemberMutation";

/** Persisted resend refusal supplies a visible wait that eventually unlocks. */
export function useInvitationResend(member: Readonly<AdminMemberDto>): {
  mutation: ReturnType<typeof useMemberMutation>;
  waitSeconds: number;
  sent: boolean;
  onResend: () => void;
} {
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [sent, setSent] = useState(false);
  const mutation = useMemberMutation({
    onSaved: () => {
      setSent(true);
      setWaitSeconds(60);
    },
    onFailed: (error) => {
      if (error instanceof ApiRequestError && error.code === "rate_limited") {
        setWaitSeconds(error.details?.retryAfterSeconds ?? 60);
      }
    },
  });
  useInterval(
    () => {
      setWaitSeconds((seconds) => {
        return Math.max(0, seconds - 1);
      });
    },
    1000,
    { autoInvoke: true },
  );
  return {
    mutation,
    waitSeconds,
    sent,
    onResend: () => {
      setSent(false);
      mutation.mutate({ kind: "resend", member });
    },
  };
}

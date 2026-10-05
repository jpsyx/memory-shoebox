import { useState } from "react";

/** The inline invitation's visibility and committed queued address. */
export type MembersInvitationState = {
  isInviting: boolean;
  sentEmail: string | undefined;
  onOpen: () => void;
  onClose: () => void;
  onSent: (email: string) => void;
};

/** Keeps the invite composition separate from directory and dialog state. */
export function useMembersInvitation(): MembersInvitationState {
  const [isInviting, setIsInviting] = useState(false);
  const [sentEmail, setSentEmail] = useState<string | undefined>();
  return {
    isInviting,
    sentEmail,
    onOpen: () => {
      setIsInviting(true);
    },
    onClose: () => {
      setIsInviting(false);
    },
    onSent: (email) => {
      setSentEmail(email);
      setIsInviting(false);
    },
  };
}

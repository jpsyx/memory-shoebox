import {
  listMemberSuggestionsRequestSchema,
  type ListMemberSuggestionsResponse,
} from "@memory-shoebox/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useDebouncedValue } from "@mantine/hooks";
import { useState } from "react";
import { makeMemberSuggestionsQueryOptionsFromEmail } from "@/api/adminMembersHelpers/adminMembersHelpers";
type InvitationDraft = {
  email: string;
  setEmail: (email: string) => void;
  setEditedName: (name: string) => void;
  displayName: string;
  suggestions: UseQueryResult<ListMemberSuggestionsResponse, Error>;
};

/**
 * Suggested names supply a default until the administrator deliberately edits.
 */
export function useInvitationDraft(): InvitationDraft {
  const [email, setEmail] = useState("");
  const [editedName, setEditedName] = useState<string | undefined>();
  const [debouncedEmail] = useDebouncedValue(email, 200);
  const normalized = listMemberSuggestionsRequestSchema.safeParse({
    email: debouncedEmail,
  });
  const suggestions = useQuery({
    ...makeMemberSuggestionsQueryOptionsFromEmail(
      normalized.success ? normalized.data.email : "unused@example.com",
    ),
    enabled: normalized.success,
    retry: false,
  });
  return {
    email,
    setEmail,
    setEditedName,
    displayName:
      editedName ?? suggestions.data?.suggestions[0]?.person.displayName ?? "",
    suggestions,
  };
}

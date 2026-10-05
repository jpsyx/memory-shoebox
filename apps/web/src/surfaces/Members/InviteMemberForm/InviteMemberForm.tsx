import { Button, NativeSelect, Stack, TextInput } from "@mantine/core";
import {
  inviteMemberRequestSchema,
  type MemberRole,
} from "@memory-shoebox/shared";
import { useState, type ReactNode } from "react";
import { ApiRequestError } from "@/api/clientHelpers/clientHelpers";
import { useInvitationDraft } from "@/surfaces/Members/InviteMemberForm/useInvitationDraft";
import {
  memberFailure,
  memberFieldError,
  ROLE_OPTIONS,
} from "@/surfaces/Members/memberCopy";
import { useMemberMutation } from "@/surfaces/Members/useMemberMutation";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Banner } from "@/system/Chrome/Banner";
import { Sheet } from "@/system/Chrome/Sheet";
import { SheetHead } from "@/system/Chrome/SheetHead";
import { Prose } from "@/system/typography/Prose";

type Props = { onClose: () => void; onSent: (email: string) => void };
/** Inline invitation form, with editable archive suggestions and retained errors. */
export function InviteMemberForm({
  onClose,
  onSent,
}: Readonly<Props>): ReactNode {
  const draft = useInvitationDraft();
  const [role, setRole] = useState<MemberRole>("viewer");
  const [validationError, setValidationError] = useState<string | undefined>();
  const mutation = useMemberMutation({
    onSaved: (action) => {
      if (action.kind === "invite") {
        onSent(action.body.email);
      }
    },
  });
  const details =
    mutation.error instanceof ApiRequestError
      ? mutation.error.details
      : undefined;
  const onSubmit = () => {
    const parsed = inviteMemberRequestSchema.safeParse({
      email: draft.email,
      displayName: draft.displayName.trim() || undefined,
      role,
    });
    if (!parsed.success) {
      setValidationError("Enter a valid email address.");
      return;
    }
    setValidationError(undefined);
    mutation.mutate({ kind: "invite", body: parsed.data });
  };
  return (
    <Sheet wide label="Invite somebody">
      <SheetHead title="Invite somebody" />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        noValidate
      >
        <Stack gap="md">
          <TextInput
            label="Their email"
            type="email"
            description="This becomes the only address they can sign in with."
            value={draft.email}
            onChange={(event) => {
              return draft.setEmail(event.currentTarget.value);
            }}
            disabled={mutation.isPending}
            error={
              validationError ?? memberFieldError({ details, field: "email" })
            }
          />
          <TextInput
            label="What to call them"
            description="Shown on their comments and anything they put up. They can change it later."
            value={draft.displayName}
            onChange={(event) => {
              return draft.setEditedName(event.currentTarget.value);
            }}
            disabled={mutation.isPending}
            error={memberFieldError({ details, field: "displayName" })}
          />
          <Prose>
            Filled in when the archive already knows the name. Type over it if
            it is wrong.
          </Prose>
          {draft.suggestions.isError ? (
            <Prose>
              Name suggestions could not be read. You can still type their name.
            </Prose>
          ) : null}
          <NativeSelect
            label="What they can do"
            data={ROLE_OPTIONS}
            value={role}
            onChange={(event) => {
              return setRole(event.currentTarget.value as MemberRole);
            }}
            disabled={mutation.isPending}
            error={memberFieldError({ details, field: "role" })}
          />
          {mutation.error === null ? null : (
            <div role="alert">
              <Banner>{memberFailure(mutation.error)}</Banner>
            </div>
          )}
          <ChipRow>
            <Button type="submit" loading={mutation.isPending}>
              Send the invitation
            </Button>
            <Button
              variant="default"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
          </ChipRow>
        </Stack>
      </form>
    </Sheet>
  );
}

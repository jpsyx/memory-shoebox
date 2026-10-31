import { Button, Stack, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import type { useProfileCompletion } from "./useProfileCompletion/useProfileCompletion";

/** One name field, its save action, and an explicit way to sign out. */
export function ProfileCompletionForm({
  flow,
  photo,
  recovery,
}: Readonly<{
  flow: ReturnType<typeof useProfileCompletion>;
  photo?: ReactNode;
  recovery?: ReactNode;
}>): ReactNode {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!recovery && !flow.mutation.isPending && !flow.signOut.isPending) {
          flow.submit();
        }
      }}
    >
      <Stack gap="md">
        {recovery ? null : (
          <TextInput
            ref={flow.input}
            label="Your name"
            description="Use a name people recognize. You can include spaces."
            value={flow.name}
            onChange={(event) => {
              return flow.setName(event.currentTarget.value);
            }}
            error={flow.error}
          />
        )}
        {photo}
        {recovery ?? (
          <>
            <Button
              type="submit"
              disabled={flow.signOut.isPending}
              loading={flow.mutation.isPending}
            >
              {flow.mutation.isPending ? "Saving..." : "Continue"}
            </Button>
            <Button
              variant="default"
              disabled={flow.mutation.isPending || flow.signOut.isPending}
              onClick={() => {
                return flow.signOut.mutate();
              }}
            >
              Sign out
            </Button>
          </>
        )}
      </Stack>
    </form>
  );
}

import { Button, Stack, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import type { useProfileCompletion } from "./useProfileCompletion/useProfileCompletion";

/** One name field, its save action, and an explicit way to sign out. */
export function ProfileCompletionForm({
  flow,
}: Readonly<{ flow: ReturnType<typeof useProfileCompletion> }>): ReactNode {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!flow.mutation.isPending && !flow.signOut.isPending) flow.submit();
      }}
    >
      <Stack gap="md">
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
      </Stack>
    </form>
  );
}

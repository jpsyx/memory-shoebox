import { Button } from "@mantine/core";
import type { ReactNode } from "react";
import type { InvitationFormState } from "@/surfaces/Members/InviteMemberForm/useInvitationForm";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Banner } from "@/system/Chrome/Banner";

type Props = { form: InvitationFormState; onClose: () => void };
/** Pending submissions cannot be duplicated or cancelled, and refusal is live. */
export function InviteMemberControls({
  form,
  onClose,
}: Readonly<Props>): ReactNode {
  return (
    <>
      {form.failure === undefined ? null : (
        <div role="alert">
          <Banner>{form.failure}</Banner>
        </div>
      )}
      <ChipRow>
        <Button type="submit" loading={form.isPending} disabled={form.hasSent}>
          Send the invitation
        </Button>
        <Button variant="default" disabled={form.isPending} onClick={onClose}>
          {form.hasSent ? "Done" : "Cancel"}
        </Button>
      </ChipRow>
    </>
  );
}

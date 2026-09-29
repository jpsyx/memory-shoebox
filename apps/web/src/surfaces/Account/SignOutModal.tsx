import { Button, Modal, Stack } from "@mantine/core";
import type { ReactNode } from "react";
import type { SessionDto } from "@memory-shoebox/shared";
import { ChipRow } from "@/system/Chip/ChipRow";
import { Prose } from "@/system/typography/Prose";

/**
 * Props for the sign-out confirmation. `device` is undefined between
 * confirmations, which is what keeps the modal closed: `DevicesSheet` sets it
 * to whichever row's "Sign out" (or "Sign out here") was pressed.
 */
type Props = {
  device: SessionDto | undefined;
  onConfirm: () => void;
  onCancel: () => void;
  isSigningOut: boolean;
};

/**
 * The confirmation before a device stops working.
 *
 * Signing out another device and signing out the one you are on are the same
 * route with different copy, because the consequence is different: another
 * device stops working straight away and is named, this one needs a fresh
 * six-digit code to get back in.
 */
export function SignOutModal({
  device,
  onConfirm,
  onCancel,
  isSigningOut,
}: Readonly<Props>): ReactNode {
  const isCurrent = device?.isCurrent === true;

  return (
    <Modal
      opened={device !== undefined}
      onClose={onCancel}
      title={isCurrent ? "Sign out of this device?" : "Sign this device out?"}
    >
      <Stack gap="md">
        <Prose>
          {isCurrent
            ? "You are using this one. Signing out here means you will need a fresh six-digit code to get back in, on this device."
            : `${device?.deviceLabel ?? "That device"} stops working straight away. Whoever is holding it will see the sign-in page and nothing else.`}
        </Prose>
        <ChipRow>
          <Button variant="danger" loading={isSigningOut} onClick={onConfirm}>
            {isCurrent ? "Sign out here" : "Sign it out"}
          </Button>
          <Button variant="default" disabled={isSigningOut} onClick={onCancel}>
            Leave it
          </Button>
        </ChipRow>
      </Stack>
    </Modal>
  );
}

import { Button, Group } from "@mantine/core";
import { IconFlag } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
/** The same private request actions, with the drawn flag and explicit back link. */
export function RemovalAskControls({
  itemId,
  isDisabled,
  onSend,
}: Readonly<{
  itemId: string;
  isDisabled: boolean;
  onSend: () => void;
}>): ReactNode {
  return (
    <Group>
      <Button
        leftSection={<IconFlag size={16} aria-hidden="true" />}
        onClick={onSend}
        disabled={isDisabled}
      >
        Send the request
      </Button>
      <Button
        renderRoot={(props) => {
          return <Link {...props} to="/items/$itemId" params={{ itemId }} />;
        }}
        variant="default"
        disabled={isDisabled}
      >
        Never mind
      </Button>
    </Group>
  );
}

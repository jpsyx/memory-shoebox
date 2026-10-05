import { Button, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { useObservationAuthority } from "./useObservationAuthority";
import { isObservationAuthorityError } from "./isObservationAuthorityError";

type Props = {
  error: Error | null;
  hasData: boolean;
  onRetry: () => void;
  children: ReactNode;
};
/** Refusals hide records; transport failures retain explicitly stale records. */
export function ObservationReadBoundary({
  error,
  hasData,
  onRetry,
  children,
}: Readonly<Props>): ReactNode {
  const authority = useObservationAuthority(error);
  if (isObservationAuthorityError(error)) {
    return (
      <Stack gap="sm">
        <Text role="alert">
          {authority.error === null
            ? "These records are unavailable while your access is checked."
            : `Your access could not be checked: ${authority.error.message}`}
        </Text>
        <Button
          disabled={authority.isPending}
          onClick={() => {
            if (authority.isError) {
              authority.mutate();
            } else {
              onRetry();
            }
          }}
        >
          {authority.isError ? "Retry account check" : "Retry records"}
        </Button>
      </Stack>
    );
  }
  return (
    <>
      {error !== null && hasData ? (
        <Stack gap="sm">
          <Text role="alert">
            Showing last-known records. The refresh failed.
          </Text>
          <Button onClick={onRetry}>Retry records</Button>
        </Stack>
      ) : null}
      {children}
    </>
  );
}

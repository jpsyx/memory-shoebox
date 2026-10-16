import { useEffect, type ReactNode } from "react";

type Props = { onUnmount: () => void };

/** Records root-error unmounts of the private route destination. */
export function BootstrapDestination({
  onUnmount,
}: Readonly<Props>): ReactNode {
  useEffect(
    function trackDestinationUnmount() {
      return onUnmount;
    },
    [onUnmount],
  );
  return <div>Current destination</div>;
}

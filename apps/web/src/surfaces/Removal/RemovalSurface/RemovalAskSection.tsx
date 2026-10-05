import type { ItemSummary } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { Prose } from "@/system/typography/Prose";
import { RemovalAskForm } from "../RemovalAskForm/RemovalAskForm";
import type { RemovalAsk } from "../useRemovalAsk/useRemovalAsk";
type Props = {
  item: ItemSummary;
  ask: RemovalAsk;
  showForm: boolean;
  isUnavailable: boolean;
  isAuthorityPending: boolean;
};
/** States the audience without inventing a recipient count or mail delivery. */
export function RemovalAskSection({
  item,
  ask,
  showForm,
  isUnavailable,
  isAuthorityPending,
}: Readonly<Props>): ReactNode {
  return showForm ? (
    <>
      <Prose onPanel>
        Asking records a private request for {item.uploadedBy.displayName} and
        the admins. Nothing happens to the photograph until one of them acts.
      </Prose>
      <RemovalAskForm
        ask={ask}
        itemId={item.itemId}
        isAuthorityPending={isAuthorityPending}
      />
    </>
  ) : isUnavailable ? (
    <Prose onPanel>You cannot ask for this photograph to come down.</Prose>
  ) : null;
}

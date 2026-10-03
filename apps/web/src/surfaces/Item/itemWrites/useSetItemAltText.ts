import { setItemAltText } from "@/api/items/items";
import {
  useItemDetailWrite,
  type ItemWrite,
} from "@/surfaces/Item/itemWrites/useItemDetailWrite/useItemDetailWrite";

/** The alt text override. Undefined clears it back to the composed line. */
export function useSetItemAltText(
  itemId: string,
): ItemWrite<string | undefined> {
  return useItemDetailWrite({
    itemId,
    mutationFn: (altText: string | undefined) => {
      return setItemAltText({ itemId, body: { altText: altText ?? null } });
    },
  });
}

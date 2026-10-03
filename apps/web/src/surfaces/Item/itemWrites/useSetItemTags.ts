import { setItemTags } from "@/api/items/items";
import {
  useItemDetailWrite,
  type ItemWrite,
} from "@/surfaces/Item/itemWrites/useItemDetailWrite/useItemDetailWrite";

/** The tag set, replaced whole: names as typed. */
export function useSetItemTags(itemId: string): ItemWrite<readonly string[]> {
  return useItemDetailWrite({
    itemId,
    mutationFn: (tags: readonly string[]) => {
      return setItemTags({ itemId, body: { tags: [...tags] } });
    },
  });
}

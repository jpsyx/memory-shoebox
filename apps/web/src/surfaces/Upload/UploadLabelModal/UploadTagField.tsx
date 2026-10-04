import components from "@/theme/components.module.css";
import { TagsInput } from "@mantine/core";
import type { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { useUploadLabelForm } from "./useUploadLabelForm";
type Form = ReturnType<typeof useUploadLabelForm>;
type Tags = ReturnType<
  typeof useQuery<import("@memory-shoebox/shared").TagsResponse>
>;
type Props = {
  options: Readonly<{ form: Form; tags: Tags; isLocked: boolean }>;
};

/** Collects complete tag names using Mantine’s initial focus owner. */
export function UploadTagField({ options }: Readonly<Props>): ReactNode {
  const { form, tags, isLocked } = options;
  return (
    <TagsInput
      label="Tags"
      description="Start typing. Pick one you have used before, or press Enter to make a new one."
      placeholder="hospital, first steps"
      data-autofocus
      value={form.names}
      onChange={form.onNamesChange}
      disabled={isLocked}
      data={(tags.data?.tags ?? []).map((entry) => {
        return entry.tag.name;
      })}
      splitChars={[","]}
      renderOption={({ option }) => {
        const entry = tags.data?.tags.find((tag) => {
          return tag.tag.name === option.value;
        });
        return (
          <>
            {option.value}
            <span className={components.comboOptionCount}>
              {entry?.itemCount.toLocaleString("en-GB") ?? "new"}
            </span>
          </>
        );
      }}
    />
  );
}

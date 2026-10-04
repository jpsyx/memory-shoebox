import { PeopleField } from "@/system/PeopleField/PeopleField";
import type { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { useUploadLabelForm } from "../useUploadLabelForm";
import { UploadPersonChoice } from "./UploadPersonChoice";
import classes from "./UploadPersonField.module.css";
type Form = ReturnType<typeof useUploadLabelForm>;
type People = ReturnType<
  typeof useQuery<import("@memory-shoebox/shared").PeopleResponse>
>;
type Props = {
  options: Readonly<{ form: Form; people: People; isLocked: boolean }>;
};

/** Collects people and requires a choice for repeated names. */
export function UploadPersonField({ options }: Readonly<Props>): ReactNode {
  const { form, people, isLocked } = options;
  return (
    <fieldset disabled={isLocked} className={classes.uploadPersonFieldFields}>
      <PeopleField
        label="Who is in them"
        description="Start typing. Pick a name from the list, or press Enter on one the archive has never heard of to add it."
        placeholder="Mateo, Abuela Rosa, a great-grandmother"
        data-autofocus
        mode="anyone"
        members={[]}
        people={(people.data?.people ?? []).map((entry) => {
          return { ...entry.person, itemCount: entry.itemCount };
        })}
        value={form.names}
        onChange={form.onNamesChange}
      />
      <UploadPersonChoice
        names={form.names}
        people={people.data?.people ?? []}
        choices={form.personIds}
        onChoose={form.onPersonChoice}
        isDisabled={isLocked}
      />
    </fieldset>
  );
}

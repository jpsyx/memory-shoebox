import { PeopleField } from "@/system/PeopleField/PeopleField";
import type { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { useUploadLabelForm } from "../useUploadLabelForm";
import { UploadPersonChoice } from "./UploadPersonChoice";
import classes from "./UploadPersonField.module.css";
type Form = Pick<
  ReturnType<typeof useUploadLabelForm>,
  "names" | "onNamesChange" | "personIds" | "onPersonChoice" | "onRemovePerson"
>;
type People = ReturnType<
  typeof useQuery<import("@memory-shoebox/shared").PeopleResponse>
>;
type Props = {
  options: Readonly<{ form: Form; people: People; isLocked: boolean }>;
};

function _getSelectionPropsFromForm({
  form,
  people,
}: Readonly<Props["options"]>) {
  return {
    selectedPeople: form.names.map((displayName, index) => {
      return (
        people.data?.people.find((entry) => {
          return entry.person.personId === form.personIds[String(index)];
        })?.person ?? { displayName, isMember: false }
      );
    }),
    selectedPersonIds: form.names.map((_, index) => {
      return form.personIds[String(index)];
    }),
    onSelectPerson: (person: import("@memory-shoebox/shared").PersonRef) => {
      if (Object.values(form.personIds).includes(person.personId)) {
        return;
      }
      form.onNamesChange([...form.names, person.displayName]);
      form.onPersonChoice({
        name: person.displayName,
        personId: person.personId,
        index: form.names.length,
      });
    },
  };
}

/** Collects people and requires a choice for repeated names. */
export function UploadPersonField({ options }: Readonly<Props>): ReactNode {
  const { form, people, isLocked } = options;
  return (
    <fieldset disabled={isLocked} className={classes.uploadPersonFieldFields}>
      <PeopleField
        label="Who is in them"
        description="Choose a member or add someone who isn't a member."
        placeholder="Mateo, Abuela Rosa, a great-grandmother"
        data-autofocus
        mode="anyone"
        members={[]}
        people={(people.data?.people ?? []).map((entry) => {
          return { ...entry.person, itemCount: entry.itemCount };
        })}
        {..._getSelectionPropsFromForm(options)}
        onRemovePerson={form.onRemovePerson}
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

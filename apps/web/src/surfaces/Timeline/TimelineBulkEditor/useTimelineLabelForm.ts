import { useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type {
  DirectoryPerson,
  PersonInput,
  PeopleResponse,
  TagsResponse,
} from "@memory-shoebox/shared";
import {
  makePeopleQueryOptionsFromSearchScope,
  makeTagsQueryOptionsFromSearchScope,
} from "@/api/vocabularies/vocabularies";
import { makeNameKeyFromName } from "@/system/PeopleField/makeNameKeyFromName/makeNameKeyFromName";
import type { TimelineBulkFormProps } from "./TimelineBulkDialog";

type Options = TimelineBulkFormProps & { kind: "tag" | "person" };
type LabelValues = {
  names: string[];
  personIds: Record<string, string>;
  onNamesChange: (values: readonly string[]) => void;
  onPersonChoice: (
    choice: Readonly<{ name: string; personId: string }>,
  ) => void;
};
type LabelForm = {
  form: LabelValues;
  tags: UseQueryResult<TagsResponse>;
  people: UseQueryResult<PeopleResponse>;
  directory: UseQueryResult<TagsResponse> | UseQueryResult<PeopleResponse>;
  problem: string | undefined;
  onSubmit: () => void;
};

function _getPeopleFromNames(
  options: Readonly<{
    names: readonly string[];
    entries: readonly DirectoryPerson[];
    choices: Readonly<Record<string, string>>;
  }>,
): PersonInput[] {
  return options.names.map((name) => {
    const matches = options.entries.filter((entry) => {
      return (
        makeNameKeyFromName(entry.person.displayName) ===
        makeNameKeyFromName(name)
      );
    });
    const chosen =
      matches.find((entry) => {
        return entry.person.personId === options.choices[name];
      }) ?? (matches.length === 1 ? matches[0] : undefined);
    if (matches.length > 1 && !chosen) {
      throw new Error(`Choose which ${name} to tag before saving.`);
    }
    return chosen
      ? { personId: chosen.person.personId }
      : { displayName: name };
  });
}

function useLabelValues(): LabelValues {
  const [names, setNames] = useState<string[]>([]);
  const [personIds, setPersonIds] = useState<Record<string, string>>({});
  return {
    names,
    personIds,
    onNamesChange: (values) => {
      setNames([...values]);
    },
    onPersonChoice: ({ name, personId }) => {
      setPersonIds((choices) => {
        return { ...choices, [name]: personId };
      });
    },
  };
}

function useLabelDirectories(
  kind: Options["kind"],
): Pick<LabelForm, "tags" | "people" | "directory"> {
  const tags = useQuery({
    ...makeTagsQueryOptionsFromSearchScope({ q: undefined }),
    enabled: kind === "tag",
  });
  const people = useQuery({
    ...makePeopleQueryOptionsFromSearchScope({ q: undefined }),
    enabled: kind === "person",
  });
  return { tags, people, directory: kind === "tag" ? tags : people };
}

function _submitLabels(
  options: Readonly<{
    props: Options;
    form: LabelValues;
    entries: readonly DirectoryPerson[];
    onProblem: (problem: string | undefined) => void;
  }>,
): void {
  const { props, form, entries, onProblem } = options;
  onProblem(undefined);
  try {
    const itemIds = [...props.itemIds];
    props.onSubmit(
      props.kind === "tag"
        ? { action: "tags", itemIds, tags: form.names }
        : {
            action: "people",
            itemIds,
            people: _getPeopleFromNames({
              names: form.names,
              entries,
              choices: form.personIds,
            }),
          },
    );
  } catch (error) {
    onProblem(
      error instanceof Error ? error.message : "Choose names before saving.",
    );
  }
}

/** Maintains additive labels and the explicit choice for duplicate person names. */
export function useTimelineLabelForm(props: Readonly<Options>): LabelForm {
  const form = useLabelValues();
  const directories = useLabelDirectories(props.kind);
  const [problem, setProblem] = useState<string>();
  return {
    form,
    ...directories,
    problem,
    onSubmit: () => {
      _submitLabels({
        props,
        form,
        entries: directories.people.data?.people ?? [],
        onProblem: setProblem,
      });
    },
  };
}

import { usePersonSelections } from "@/system/PeopleField/usePersonSelections";
import { makeNameKeyFromName } from "@/system/PeopleField/makeNameKeyFromName/makeNameKeyFromName";
import type {
  UploadDraftLabel,
  UploadEditAttempt,
  UploadSessionController,
} from "@/upload/createUploadSessionController/createUploadSessionController.types";
import type { DirectoryPerson, TagCount } from "@memory-shoebox/shared";
import { useRef, useState } from "react";

type Options = {
  kind: "tag" | "person";
  controller: UploadSessionController;
  tags: readonly TagCount[];
  people: readonly DirectoryPerson[];
  onClose: () => void;
};
function _getLabelFromName(
  options: Readonly<{ name: string; options: Options; personId?: string }>,
): UploadDraftLabel {
  const { name, personId } = options;
  const key = makeNameKeyFromName(name);
  if (options.options.kind === "tag") {
    const tag = options.options.tags.find((entry) => {
      return makeNameKeyFromName(entry.tag.name) === key;
    });
    return tag
      ? { kind: "tag", tagId: tag.tag.tagId }
      : { kind: "tag", labelSnapshot: name };
  }
  if (personId) {
    return { kind: "person", personId };
  }
  const matches = options.options.people.filter((entry) => {
    return (
      !entry.person.isMember &&
      makeNameKeyFromName(entry.person.displayName) === key
    );
  });
  const chosen = matches.find((entry) => {
    return entry.person.personId === personId;
  });
  if (matches.length > 1 && !chosen) {
    throw new Error(`Choose which ${name} to tag before saving.`);
  }
  const person = chosen ?? matches[0];
  return person
    ? { kind: "person", personId: person.person.personId }
    : { kind: "person", labelSnapshot: name };
}
type Form = {
  names: string[];
  onNamesChange: (value: readonly string[]) => void;
  personIds: Record<string, string>;
  onRemovePerson: (index: number) => void;
  onPersonChoice: ({
    name,
    personId,
  }: Readonly<{ name: string; personId: string; index?: number }>) => void;
  error?: string;
  isSaving: boolean;
  onSubmit: () => Promise<void>;
};
type Submission = {
  options: Options;
  names: string[];
  labels: UploadDraftLabel[];
  onNamesChange: (names: string[], retainedIndices?: number[]) => void;
  onError: (error: string) => void;
  attempts: Map<string, UploadEditAttempt>;
};
async function _submitLabels({
  options,
  names,
  labels,
  onNamesChange,
  onError,
  attempts,
}: Readonly<Submission>): Promise<void> {
  const before = options.controller.getSnapshot();
  const completedLabels = new Set<UploadDraftLabel>();
  try {
    for (const label of labels) {
      const key = JSON.stringify(label);
      const retained = attempts.get(key);
      const attempt =
        retained?.sessionId === before.detail!.sessionId
          ? retained
          : {
              sessionId: before.detail!.sessionId,
              preserveSelection: true,
              labels: [label],
              targetFileIds: [...before.selectedFileIds],
            };
      attempts.set(key, attempt);
      await options.controller.applyEditAttempt(attempt);
      // A retained attempt confirms the whole action, including earlier chunks.
      completedLabels.add(label);
      attempts.delete(key);
    }
    options.controller.clearSelection();
    onNamesChange([]);
    options.onClose();
  } catch (failure) {
    const retainedIndices = names.flatMap((_, position) => {
      return completedLabels.has(labels[position]!) ? [] : [position];
    });
    onNamesChange(
      retainedIndices.map((index) => {
        return names[index]!;
      }),
      retainedIndices,
    );
    onError(failure instanceof Error ? failure.message : String(failure));
  }
}
function _getLabelsFromNames(
  options: Readonly<{
    names: readonly string[];
    formOptions: Options;
    personIds: Readonly<Record<string, string>>;
  }>,
): UploadDraftLabel[] {
  return options.names.map((name, index) => {
    return _getLabelFromName({
      name,
      options: options.formOptions,
      personId: options.personIds[String(index)],
    });
  });
}
async function _submitForm(
  options: Readonly<
    Omit<Submission, "labels"> & { personIds: Record<string, string> }
  >,
): Promise<void> {
  try {
    const labels = _getLabelsFromNames({
      names: options.names,
      formOptions: options.options,
      personIds: options.personIds,
    });
    await _submitLabels({ ...options, labels });
  } catch (failure) {
    options.onError(
      failure instanceof Error ? failure.message : String(failure),
    );
  }
}

/**
 * Retains unsaved modal input and removes only fully confirmed label writes.
 */
export function useUploadLabelForm(options: Readonly<Options>): Form {
  const selections = usePersonSelections();
  const { names, personIds } = selections;
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const pending = useRef(false);
  const attempts = useRef(new Map<string, UploadEditAttempt>());
  const onSubmit = async () => {
    if (pending.current || names.length === 0) {
      return;
    }
    pending.current = true;
    setIsSaving(true);
    setError(undefined);
    try {
      await _submitForm({
        options,
        attempts: attempts.current,
        names,
        personIds,
        onNamesChange: selections.retain,
        onError: setError,
      });
    } finally {
      pending.current = false;
      setIsSaving(false);
    }
  };
  return {
    ...selections,
    error,
    isSaving,
    onSubmit,
  };
}

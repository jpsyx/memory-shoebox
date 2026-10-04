import { makeNameKeyFromName } from "@/system/PeopleField/makeNameKeyFromName/makeNameKeyFromName";
import type {
  UploadDraftLabel,
  UploadEditAttempt,
  UploadSessionController,
} from "@/upload/uploadSessionController/uploadSessionController.types";
import type {
  DirectoryPerson,
  TagCount,
  UploadBatchEditDto,
} from "@memory-shoebox/shared";
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
  const matches = options.options.people.filter((entry) => {
    return makeNameKeyFromName(entry.person.displayName) === key;
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
function _matchesSavedLabel({
  label,
  edit,
}: Readonly<{
  label: Readonly<UploadDraftLabel>;
  edit: Readonly<UploadBatchEditDto>;
}>): boolean {
  return (
    label.kind === edit.kind &&
    (label.tagId
      ? edit.tag?.tagId === label.tagId
      : label.personId
        ? edit.person?.personId === label.personId
        : makeNameKeyFromName(edit.label) ===
          makeNameKeyFromName(label.labelSnapshot ?? ""))
  );
}
type GetPendingNamesFromFailureOptions = {
  names: readonly string[];
  labels: readonly UploadDraftLabel[];
  beforeIds: ReadonlySet<string>;
  controller: UploadSessionController;
  targetCount: number;
};
function _getPendingNamesFromFailure(
  options: Readonly<GetPendingNamesFromFailureOptions>,
): string[] {
  const snapshot = options.controller.getSnapshot();
  return options.names.filter((_, position) => {
    const label = options.labels[position]!;
    const confirmedCount =
      snapshot.detail?.edits
        .filter((edit) => {
          return (
            !options.beforeIds.has(edit.editId) &&
            edit.undoneAt === null &&
            snapshot.editTargets.has(edit.editId) &&
            _matchesSavedLabel({ label: label, edit: edit })
          );
        })
        .reduce((total, edit) => {
          return total + edit.targetCount;
        }, 0) ?? 0;
    return confirmedCount < options.targetCount;
  });
}
type Form = {
  names: string[];
  onNamesChange: (value: readonly string[]) => void;
  personIds: Record<string, string>;
  onPersonChoice: (name: string, personId: string) => void;
  error?: string;
  isSaving: boolean;
  onSubmit: () => Promise<void>;
};
type Submission = {
  options: Options;
  names: string[];
  labels: UploadDraftLabel[];
  onNamesChange: (names: string[]) => void;
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
  const beforeIds = new Set(
    before.detail?.edits.map((edit) => {
      return edit.editId;
    }),
  );
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
      attempts.delete(key);
    }
    options.controller.clearSelection();
    onNamesChange([]);
    options.onClose();
  } catch (failure) {
    onNamesChange(
      _getPendingNamesFromFailure({
        names,
        labels,
        beforeIds,
        controller: options.controller,
        targetCount: before.selectedFileIds.size,
      }),
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
  return options.names.map((name) => {
    return _getLabelFromName({
      name,
      options: options.formOptions,
      personId: options.personIds[name],
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
  const [names, setNames] = useState<string[]>([]);
  const [personIds, setPersonIds] = useState<Record<string, string>>({});
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
        onNamesChange: setNames,
        onError: setError,
      });
    } finally {
      pending.current = false;
      setIsSaving(false);
    }
  };
  return {
    names,
    onNamesChange: (value) => {
      setNames([...value]);
    },
    personIds,
    onPersonChoice: (name, personId) => {
      setPersonIds((choices) => {
        return { ...choices, [name]: personId };
      });
    },
    error,
    isSaving,
    onSubmit,
  };
}

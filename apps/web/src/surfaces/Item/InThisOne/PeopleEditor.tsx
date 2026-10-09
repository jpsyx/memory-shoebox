import { Stack } from "@mantine/core";
import { LIMITS, type ItemDetail } from "@memory-shoebox/shared";
import type { ReactNode } from "react";
import { EditorFooter } from "@/surfaces/Item/InThisOne/EditorFooter";
import { peopleCapProse } from "@/surfaces/Item/itemCopyHelpers/itemCopyHelpers";
import { PeopleField } from "@/system/PeopleField/PeopleField";
import { Prose } from "@/system/typography/Prose";
import { RenamePersonModal } from "./RenamePersonModal";
import { usePeopleEditor } from "./usePeopleEditor";

type Props = { detail: ItemDetail; onDone: () => void };

/** Saves explicit choices and manages ad-hoc identities from the same menu. */
export function PeopleEditor({ detail, onDone }: Readonly<Props>): ReactNode {
  const editor = usePeopleEditor(detail);
  const { management, renaming } = editor;
  return (
    <Stack gap="sm">
      <PeopleField
        {...editor.inputProps}
        label="Who is in it"
        description="Start typing. Click a name or press Enter to tag them."
        placeholder="Mateo, Abuela Rosa"
        mode="anyone"
        autoFocus
        members={[]}
      />
      {editor.inputProps.value.length >= LIMITS.itemMaxPeople ? (
        <Prose>{peopleCapProse(detail.kind)}</Prose>
      ) : null}
      <EditorFooter
        error={
          renaming ? editor.writeError : (management.error ?? editor.writeError)
        }
        onDone={onDone}
      />
      {renaming ? (
        <RenamePersonModal
          key={renaming.personId}
          person={renaming}
          isSaving={management.isSaving}
          error={management.error}
          onClose={editor.closeRename}
          onSave={(displayName) => {
            management.save({ personId: renaming.personId, displayName });
          }}
        />
      ) : null}
    </Stack>
  );
}

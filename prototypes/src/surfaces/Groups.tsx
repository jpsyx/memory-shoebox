import {
  Button,
  Checkbox,
  Modal,
  Stack,
  Table,
  TextInput,
} from "@mantine/core";
import { IconAlertCircle, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { GROUPS, MEMBERS, memberById, type Group } from "@/data/fixtures";
import { Banner, Sheet, SheetHead, TopBar } from "@/system/Chrome";
import { Chip, ChipRow } from "@/system/Chip";
import { ICON_PROPS } from "@/system/icons";
import { Lede, Prose } from "@/system/typography";
import classes from "@/system/system.module.css";
import type { Surface } from "@/surfaces/registry";

type GroupsState = "list" | "create" | "edit" | "delete" | "delete-used";

function GroupsSurface({ state }: { readonly state: GroupsState }) {
  const [editing, setEditing] = useState<Group | undefined>(
    state === "edit" ? GROUPS[1] : undefined,
  );
  const [deleting, setDeleting] = useState<Group | undefined>(
    state === "delete"
      ? GROUPS[3]
      : state === "delete-used"
        ? GROUPS[0]
        : undefined,
  );

  return (
    <>
      <TopBar back="Back to my account" />
      <main className={classes.pageWide}>
        <Stack gap="lg">
          <Lede>Groups.</Lede>
          <Prose onPanel>
            Named sets of people, so who can see something can be said in one
            word instead of nine names. Flat, with no nesting, and a person can
            be in as many as you like.
          </Prose>

          <Banner onPanel>
            <b>
              Groups are worked out when somebody looks, not when something goes
              up.
            </b>{" "}
            Add a cousin to <b>Cousins</b> next year and they get everything
            that was ever restricted to Cousins. Take them out and it all closes
            again. Nothing is fixed at the moment of upload.
          </Banner>

          {state === "create" ? (
            <Sheet wide label="A new group">
              <SheetHead title="A new group" />
              <Stack gap="md">
                <TextInput
                  label="What to call it"
                  description="Whatever the family actually says out loud. The grandparents, the cousins, Lucía's side."
                  placeholder="The cousins"
                />
                <Checkbox.Group label="Who is in it" defaultValue={[]}>
                  <Stack gap="sm" mt="sm">
                    {MEMBERS.filter((member) => {
                      return member.status === "active";
                    }).map((member) => {
                      return (
                        <Checkbox
                          key={member.id}
                          value={member.id}
                          label={member.name}
                        />
                      );
                    })}
                  </Stack>
                </Checkbox.Group>
                <ChipRow>
                  <Button>Create the group</Button>
                  <Button variant="default">Cancel</Button>
                </ChipRow>
              </Stack>
            </Sheet>
          ) : null}

          <Sheet wide label="Groups">
            <SheetHead title={`${GROUPS.length} groups`}>
              {state === "create" ? null : (
                <Button leftSection={<IconPlus {...ICON_PROPS} />}>
                  New group
                </Button>
              )}
            </SheetHead>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Group</Table.Th>
                  <Table.Th>Who is in it</Table.Th>
                  <Table.Th>Used by</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {GROUPS.map((group) => {
                  return (
                    <Table.Tr key={group.id}>
                      <Table.Td>
                        <b>{group.name}</b>
                      </Table.Td>
                      <Table.Td>
                        <ChipRow>
                          {group.memberIds.map((id) => {
                            return (
                              <Chip key={id}>{memberById(id)?.name ?? id}</Chip>
                            );
                          })}
                        </ChipRow>
                      </Table.Td>
                      <Table.Td className={classes.tabular}>
                        {group.usedByRules === 0
                          ? "Nothing yet"
                          : `${group.usedByRules} items`}
                      </Table.Td>
                      <Table.Td>
                        <ChipRow>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              return setEditing(group);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              return setDeleting(group);
                            }}
                          >
                            Delete
                          </Button>
                        </ChipRow>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Sheet>
        </Stack>
      </main>

      <Modal
        opened={editing !== undefined}
        onClose={() => {
          return setEditing(undefined);
        }}
        title={editing?.name ?? "Group"}
      >
        <Stack gap="md">
          <TextInput label="What to call it" defaultValue={editing?.name} />
          <Checkbox.Group
            label="Who is in it"
            defaultValue={[...(editing?.memberIds ?? [])]}
          >
            <Stack gap="sm" mt="sm">
              {MEMBERS.filter((member) => {
                return member.status === "active";
              }).map((member) => {
                return (
                  <Checkbox
                    key={member.id}
                    value={member.id}
                    label={member.name}
                  />
                );
              })}
            </Stack>
          </Checkbox.Group>
          <Prose>
            Whoever you add can see everything already restricted to this group,
            straight away and without anybody revisiting those photographs.
          </Prose>
          <ChipRow>
            <Button
              onClick={() => {
                return setEditing(undefined);
              }}
            >
              Save
            </Button>
            <Button
              variant="default"
              onClick={() => {
                return setEditing(undefined);
              }}
            >
              Cancel
            </Button>
          </ChipRow>
        </Stack>
      </Modal>

      <Modal
        opened={deleting !== undefined}
        onClose={() => {
          return setDeleting(undefined);
        }}
        title={`Delete ${deleting?.name ?? "this group"}?`}
      >
        <Stack gap="md">
          {(deleting?.usedByRules ?? 0) > 0 ? (
            <>
              <Banner icon={<IconAlertCircle {...ICON_PROPS} />}>
                <b>
                  {deleting?.usedByRules} items say who can see them using this
                  group.
                </b>{" "}
                Deleting it takes the group out of all of them. Anybody who
                could only see those through this group loses them, and nobody
                is told.
              </Banner>
              <Prose>
                The three people in it keep their own access to anything named
                individually. Nothing else changes, and no photograph is
                deleted.
              </Prose>
              <ChipRow>
                <Button
                  variant="danger"
                  onClick={() => {
                    return setDeleting(undefined);
                  }}
                >
                  Delete it anyway
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    return setDeleting(undefined);
                  }}
                >
                  Keep it
                </Button>
              </ChipRow>
            </>
          ) : (
            <>
              <Prose>
                Nothing points at this group, so deleting it changes what nobody
                can see. The people in it are unaffected.
              </Prose>
              <ChipRow>
                <Button
                  variant="danger"
                  onClick={() => {
                    return setDeleting(undefined);
                  }}
                >
                  Delete it
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    return setDeleting(undefined);
                  }}
                >
                  Cancel
                </Button>
              </ChipRow>
            </>
          )}
        </Stack>
      </Modal>
    </>
  );
}

export const groupsSurface: Surface = {
  id: "groups",
  number: 13,
  title: "Groups",
  who: "admins",
  group: "admin",
  blurb:
    "Named sets of people that make visibility expressible without naming individuals one at a time, evaluated at read time so membership is retroactive.",
  states: [
    {
      id: "list",
      label: "The list",
      note: "Each group carries how many items depend on it, which is the number that makes deleting one dangerous.",
      render: () => {
        return <GroupsSurface state="list" />;
      },
    },
    {
      id: "create",
      label: "Create",
      note: "Asks for the name the family actually says out loud, because a group nobody recognises will not get used.",
      render: () => {
        return <GroupsSurface state="create" />;
      },
    },
    {
      id: "edit",
      label: "Rename, add and remove",
      note: "States the retroactive consequence at the moment of adding somebody, which is the part that surprises people.",
      render: () => {
        return <GroupsSurface state="edit" />;
      },
    },
    {
      id: "delete",
      label: "Delete an unused group",
      note: "Nothing points at it, so the confirmation says so and gets out of the way.",
      render: () => {
        return <GroupsSurface state="delete" />;
      },
    },
    {
      id: "delete-used",
      label: "Delete one still in use",
      note: "Fourteen items point at this group. The count, the effect, and the fact that nobody is told all go in the dialog.",
      render: () => {
        return <GroupsSurface state="delete-used" />;
      },
    },
  ],
};

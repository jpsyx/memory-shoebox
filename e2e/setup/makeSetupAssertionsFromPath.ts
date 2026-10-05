import { DatabaseSync } from "node:sqlite";

type MemberRow = { id: string; email: string; role: string; status: string };
type InvitationRow = {
  member_id: string;
  send_count: number;
  accepted_at: string | null;
};
type EmailRow = {
  kind: string;
  to_address: string;
  state: string;
  payload_json: string;
};

type SetupAssertions = {
  members: () => MemberRow[];
  invitations: () => InvitationRow[];
  emails: () => EmailRow[];
  pendingMemberId: () => string | null;
  shoeboxName: () => string;
  close: () => void;
};

/** A separate SQLite read-only connection, with no catalog mutation surface. */
export function makeSetupAssertionsFromPath(path: string): SetupAssertions {
  const database = new DatabaseSync(path, { readOnly: true });
  return {
    members: (): MemberRow[] => {
      return database
        .prepare("SELECT id, email, role, status FROM members ORDER BY email")
        .all() as MemberRow[];
    },
    invitations: (): InvitationRow[] => {
      return database
        .prepare("SELECT member_id, send_count, accepted_at FROM invitations")
        .all() as InvitationRow[];
    },
    emails: (): EmailRow[] => {
      return database
        .prepare(
          "SELECT kind, to_address, state, payload_json FROM outbound_emails ORDER BY created_at",
        )
        .all() as EmailRow[];
    },
    pendingMemberId: (): string | null => {
      const row = database
        .prepare(
          "SELECT value FROM settings WHERE key = 'setup.pending_member_id'",
        )
        .get() as { value: string } | undefined;
      return row === undefined
        ? null
        : (JSON.parse(row.value) as string | null);
    },
    shoeboxName: (): string => {
      const row = database
        .prepare("SELECT value FROM settings WHERE key = 'shoebox.name'")
        .get() as { value: string };
      return JSON.parse(row.value) as string;
    },
    close: (): void => {
      return database.close();
    },
  };
}

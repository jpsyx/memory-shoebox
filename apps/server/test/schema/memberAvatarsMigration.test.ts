import { expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase } from "../../src/db/client.ts";
import { migrateToLatest } from "../../src/db/migrate.ts";
import { getMigrationSourcesFromFiles } from "../../src/db/migrationSources.ts";
import {
  insertMember,
  insertSession,
} from "../helpers/seedHelpers/memberSeedHelpers.ts";

it("preserves populated 0019 member, claim, and session history while adding empty avatar ownership", async () => {
  const database = createDatabase(":memory:");
  try {
    const sources = await getMigrationSourcesFromFiles();
    await migrateToLatest(database, {
      sources: Object.fromEntries(
        Object.entries(sources).filter(([name]) => {
          return name < "0020";
        }),
      ),
    });
    const memberId = await insertMember(database, {
      display_name: "Preserved Name",
    });
    await insertSession(database, { memberId });
    const sessions = await database
      .selectFrom("sessions")
      .selectAll()
      .execute();
    const members = await sql`select * from members`.execute(database);
    const claims = await sql`select * from member_name_claims`.execute(
      database,
    );
    const history =
      await sql`select * from kysely_migration order by name`.execute(database);
    await migrateToLatest(database);
    const upgraded = await database.selectFrom("members").selectAll().execute();
    expect(
      upgraded.map(({ avatar_id, notify_on_comment_tag, notify_upload_frequency, notify_comment_frequency, notify_comment_tag_frequency, ...member }) => {
        return member;
      }),
    ).toEqual(members.rows);
    expect(
      upgraded.every((member) => {
        return member.avatar_id === null;
      }),
    ).toBe(true);
    expect(
      (await sql`select * from member_name_claims`.execute(database)).rows,
    ).toEqual(claims.rows);
    expect(
      (
        await sql`select * from kysely_migration order by name`.execute(
          database,
        )
      ).rows.slice(0, history.rows.length),
    ).toEqual(history.rows);
    expect(await database.selectFrom("sessions").selectAll().execute()).toEqual(
      sessions,
    );
    expect(
      await database.selectFrom("member_avatar_uploads").selectAll().execute(),
    ).toEqual([]);
  } finally {
    await database.destroy();
  }
});

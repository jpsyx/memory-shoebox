import { expect, it } from "vitest";
import {
  makeGroupUsageTokenFromSnapshot,
  isGroupUsageTokenValid,
} from "../../src/administration/groupUsageTokenHelpers.ts";

it("binds snapshot, issue time and separate secret with a ten-minute boundary", () => {
  const options = {
    snapshot: '{"groupId":"one","rules":[]}',
    secret: "secret",
    now: "2026-10-04T12:00:00.000Z",
  };
  const token = makeGroupUsageTokenFromSnapshot(options);
  expect(isGroupUsageTokenValid({ ...options, token })).toBe(true);
  expect(
    isGroupUsageTokenValid({
      ...options,
      token,
      now: "2026-10-04T12:09:59.999Z",
    }),
  ).toBe(true);
  expect(
    isGroupUsageTokenValid({
      ...options,
      token,
      now: "2026-10-04T12:10:00.000Z",
    }),
  ).toBe(false);
  expect(
    isGroupUsageTokenValid({
      ...options,
      token,
      now: "2026-10-04T11:59:59.999Z",
    }),
  ).toBe(false);
  expect(
    isGroupUsageTokenValid({
      ...options,
      token,
      snapshot: '{"groupId":"two","rules":[]}',
    }),
  ).toBe(false);
  expect(isGroupUsageTokenValid({ ...options, token, secret: "other" })).toBe(
    false,
  );
  expect(isGroupUsageTokenValid({ ...options, token: "malformed" })).toBe(
    false,
  );
});

it("refuses noncanonical encoding of an otherwise valid signature", () => {
  const options = {
    snapshot: "snapshot",
    secret: "secret",
    now: "2026-10-04T12:00:00.000Z",
  };
  const token = makeGroupUsageTokenFromSnapshot(options);
  expect(isGroupUsageTokenValid({ ...options, token: `${token}=` })).toBe(
    false,
  );
});

it("rejects modified unused bits in the base64url signature", () => {
  const options = {
    snapshot: "snapshot",
    secret: "secret",
    now: "2026-10-04T12:00:00.000Z",
  };
  const token = makeGroupUsageTokenFromSnapshot(options);
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const alteredCharacter = alphabet[alphabet.indexOf(token.at(-1)!) + 1]!;
  expect(
    isGroupUsageTokenValid({
      ...options,
      token: `${token.slice(0, -1)}${alteredCharacter}`,
    }),
  ).toBe(false);
});

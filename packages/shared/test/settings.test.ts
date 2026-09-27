import { describe, expect, it } from "vitest";
import { SETTING_DEFINITIONS, resolveSetting } from "../src/settings.ts";

describe("SETTING_DEFINITIONS", () => {
  it("covers every key the contract names", () => {
    expect(Object.keys(SETTING_DEFINITIONS).sort()).toEqual([
      "mail.domain_last_check_error",
      "mail.domain_verified_at",
      "mail.from_address",
      "mail.from_name",
      "pile.arrangement",
      "public.base_url",
      "shoebox.name",
      "shoebox.timezone",
      "visibility.generation",
    ]);
  });

  it("marks exactly two keys publicly readable", () => {
    const publicKeys = Object.entries(SETTING_DEFINITIONS)
      .filter(([, definition]) => {
        return definition.isPubliclyReadable;
      })
      .map(([key]) => {
        return key;
      })
      .sort();
    expect(publicKeys).toEqual(["public.base_url", "shoebox.name"]);
  });

  it("keeps pile.arrangement instance-scoped, never per member", () => {
    expect(SETTING_DEFINITIONS["pile.arrangement"].scopes).toEqual([
      "instance",
    ]);
  });

  it("names every key its own definition, matching the registry key", () => {
    for (const [key, definition] of Object.entries(SETTING_DEFINITIONS)) {
      expect(definition.key).toBe(key);
    }
  });

  it("rejects an unresolvable IANA zone for shoebox.timezone", () => {
    const { schema } = SETTING_DEFINITIONS["shoebox.timezone"];
    expect(schema.safeParse("UTC").success).toBe(true);
    expect(schema.safeParse("Europe/Madrid").success).toBe(true);
    expect(schema.safeParse("Mars/Olympus_Mons").success).toBe(false);
  });
});

describe("resolveSetting", () => {
  it("returns the default when a fresh instance holds no rows", () => {
    expect(resolveSetting("shoebox.name", undefined)).toBe("My Shoebox");
  });

  it("parses a stored value through the key's own schema", () => {
    expect(resolveSetting("visibility.generation", "7")).toBe(7);
  });

  it("falls back to the default when a stored value is malformed", () => {
    expect(resolveSetting("visibility.generation", "banana")).toBe(0);
  });

  it("falls back to the default when a stored enum value no longer parses", () => {
    expect(resolveSetting("pile.arrangement", "sparkly")).toBe("messy");
  });

  it("returns null for an unset nullable key, and the parsed value once set", () => {
    expect(resolveSetting("mail.from_address", undefined)).toBeNull();
    expect(resolveSetting("mail.from_address", "hello@example.com")).toBe(
      "hello@example.com",
    );
  });
});

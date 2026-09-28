import { describe, expect, it } from "vitest";
import {
  PUBLIC_SETTING_KEYS,
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  getSettingValueFromStoredValue,
  publicSettingsResponseSchema,
  shellSettingsSchema,
} from "../src/settings.ts";

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
    Object.entries(SETTING_DEFINITIONS).forEach(([key, definition]) => {
      expect(definition.key).toBe(key);
    });
  });

  it("rejects an unresolvable IANA zone for shoebox.timezone", () => {
    const { schema } = SETTING_DEFINITIONS["shoebox.timezone"];
    expect(schema.safeParse("UTC").success).toBe(true);
    expect(schema.safeParse("Europe/Madrid").success).toBe(true);
    expect(schema.safeParse("Mars/Olympus_Mons").success).toBe(false);
  });
});

/**
 * `getSettingValueFromStoredValue` decodes the `settings.value` column, which
 * the database never hands it as a bare scalar: the column is JSON-encoded text
 * (`0007_operations_and_audit.ts`, `data-models.md` § `settings`). Every case
 * below stores `JSON.stringify(value)`, the way the column actually holds it,
 * rather than the bare value the old (wrong) test suite used.
 */
describe("getSettingValueFromStoredValue", () => {
  it("returns the default when a fresh instance holds no rows", () => {
    expect(getSettingValueFromStoredValue("shoebox.name", undefined)).toBe(
      "My Shoebox",
    );
  });

  it("round-trips shoebox.name through its JSON encoding", () => {
    expect(
      getSettingValueFromStoredValue(
        "shoebox.name",
        JSON.stringify("Casa Rosa"),
      ),
    ).toBe("Casa Rosa");
  });

  it("round-trips pile.arrangement through its JSON encoding", () => {
    expect(
      getSettingValueFromStoredValue(
        "pile.arrangement",
        JSON.stringify("tidy"),
      ),
    ).toBe("tidy");
  });

  it("falls back to the default when a stored enum value no longer parses", () => {
    expect(
      getSettingValueFromStoredValue(
        "pile.arrangement",
        JSON.stringify("sparkly"),
      ),
    ).toBe("messy");
  });

  it("round-trips shoebox.timezone through its JSON encoding", () => {
    expect(
      getSettingValueFromStoredValue(
        "shoebox.timezone",
        JSON.stringify("Europe/Madrid"),
      ),
    ).toBe("Europe/Madrid");
  });

  it("round-trips mail.from_address through its JSON encoding, nulls included", () => {
    expect(
      getSettingValueFromStoredValue("mail.from_address", undefined),
    ).toBeNull();
    expect(
      getSettingValueFromStoredValue(
        "mail.from_address",
        JSON.stringify("hola@casa.example"),
      ),
    ).toBe("hola@casa.example");
    expect(
      getSettingValueFromStoredValue("mail.from_address", JSON.stringify(null)),
    ).toBeNull();
  });

  it("round-trips mail.from_name through its JSON encoding, nulls included", () => {
    expect(
      getSettingValueFromStoredValue(
        "mail.from_name",
        JSON.stringify("Casa Rosa"),
      ),
    ).toBe("Casa Rosa");
    expect(
      getSettingValueFromStoredValue("mail.from_name", JSON.stringify(null)),
    ).toBeNull();
  });

  it("round-trips mail.domain_verified_at through its JSON encoding, nulls included", () => {
    expect(
      getSettingValueFromStoredValue(
        "mail.domain_verified_at",
        JSON.stringify("2026-09-27T00:00:00.000Z"),
      ),
    ).toBe("2026-09-27T00:00:00.000Z");
    expect(
      getSettingValueFromStoredValue(
        "mail.domain_verified_at",
        JSON.stringify(null),
      ),
    ).toBeNull();
  });

  it("round-trips mail.domain_last_check_error through its JSON encoding, nulls included", () => {
    expect(
      getSettingValueFromStoredValue(
        "mail.domain_last_check_error",
        JSON.stringify("SPF record missing"),
      ),
    ).toBe("SPF record missing");
    expect(
      getSettingValueFromStoredValue(
        "mail.domain_last_check_error",
        JSON.stringify(null),
      ),
    ).toBeNull();
  });

  it("round-trips public.base_url through its JSON encoding, nulls included", () => {
    expect(
      getSettingValueFromStoredValue(
        "public.base_url",
        JSON.stringify("https://casa.example"),
      ),
    ).toBe("https://casa.example");
    expect(
      getSettingValueFromStoredValue("public.base_url", JSON.stringify(null)),
    ).toBeNull();
  });

  it("round-trips visibility.generation through its JSON encoding", () => {
    expect(
      getSettingValueFromStoredValue(
        "visibility.generation",
        JSON.stringify(7),
      ),
    ).toBe(7);
  });

  it("falls back to the default when a stored value is malformed", () => {
    expect(
      getSettingValueFromStoredValue("visibility.generation", "banana"),
    ).toBe(0);
  });

  it("falls back to the default when a stored value is valid JSON of the wrong type", () => {
    expect(
      getSettingValueFromStoredValue(
        "visibility.generation",
        JSON.stringify("banana"),
      ),
    ).toBe(0);
    expect(
      getSettingValueFromStoredValue("shoebox.name", JSON.stringify(42)),
    ).toBe("My Shoebox");
  });
});

describe("PUBLIC_SETTING_KEYS", () => {
  it("holds exactly the keys carrying isPubliclyReadable", () => {
    const flagged = SETTING_KEYS.filter((key) => {
      return SETTING_DEFINITIONS[key].isPubliclyReadable;
    });
    expect([...PUBLIC_SETTING_KEYS].sort()).toEqual([...flagged].sort());
  });
});

describe("shellSettingsSchema", () => {
  it("accepts the three the shell needs", () => {
    const parsed = shellSettingsSchema.parse({
      shoeboxName: "My Shoebox",
      pileArrangement: "messy",
      timezone: "Europe/Madrid",
    });
    expect(parsed.pileArrangement).toBe("messy");
  });

  it("rejects an arrangement outside the two", () => {
    expect(() => {
      return shellSettingsSchema.parse({
        shoeboxName: "My Shoebox",
        pileArrangement: "neat",
        timezone: "Europe/Madrid",
      });
    }).toThrow();
  });

  it("rejects a zone Intl cannot resolve", () => {
    expect(() => {
      return shellSettingsSchema.parse({
        shoeboxName: "My Shoebox",
        pileArrangement: "tidy",
        timezone: "Mars/Olympus",
      });
    }).toThrow();
  });
});

describe("publicSettingsResponseSchema", () => {
  it("accepts a Shoebox whose base URL is not set yet", () => {
    const parsed = publicSettingsResponseSchema.parse({
      shoeboxName: "My Shoebox",
      baseUrl: null,
    });
    expect(parsed.baseUrl).toBeNull();
  });

  it("rejects a relative base URL", () => {
    expect(() => {
      return publicSettingsResponseSchema.parse({
        shoeboxName: "My Shoebox",
        baseUrl: "/shoebox",
      });
    }).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { getMemberRoleFromStoredValue } from "../../src/members/getMemberRoleFromStoredValue.ts";

describe("getMemberRoleFromStoredValue", () => {
  it("passes through a stored viewer", () => {
    expect(getMemberRoleFromStoredValue("viewer")).toBe("viewer");
  });

  it("passes through a stored uploader", () => {
    expect(getMemberRoleFromStoredValue("uploader")).toBe("uploader");
  });

  it("passes through a stored admin", () => {
    expect(getMemberRoleFromStoredValue("admin")).toBe("admin");
  });

  it("fails closed to viewer for a value nobody recognises", () => {
    expect(getMemberRoleFromStoredValue("superadmin")).toBe("viewer");
  });

  it("fails closed to viewer for an empty string", () => {
    expect(getMemberRoleFromStoredValue("")).toBe("viewer");
  });
});

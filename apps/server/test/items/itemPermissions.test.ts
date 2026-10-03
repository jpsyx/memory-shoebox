import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/http/ApiError.ts";
import type { Viewer } from "../../src/http/requestContextHelpers.ts";
import {
  assertMayChangeItemAccess,
  assertMayEditItemContent,
  makeItemCapabilitiesFromItem,
} from "../../src/items/itemPermissions.ts";

const VIEWER: Viewer = {
  memberId: "member-viewer",
  sessionId: "session",
  role: "viewer",
  isAdmin: false,
  visibleRuleIds: [],
};

const UPLOADER: Viewer = {
  ...VIEWER,
  memberId: "member-uploader",
  role: "uploader",
};
const OTHER_UPLOADER: Viewer = { ...UPLOADER, memberId: "member-other" };
const ADMIN: Viewer = {
  ...VIEWER,
  memberId: "member-admin",
  role: "admin",
  isAdmin: true,
};

/**
 * A member demoted to `viewer` after they had already uploaded something.
 *
 * `memberId` matches `UPLOADER.memberId` on purpose: this is the one member
 * for whom "the item's own uploader" (ownership, `items.uploaded_by`) and
 * "any uploader" (the current role) disagree.
 */
const DEMOTED_UPLOADER: Viewer = {
  ...VIEWER,
  memberId: UPLOADER.memberId,
  role: "viewer",
  isAdmin: false,
};

describe("assertMayEditItemContent", () => {
  it("lets any uploader and any admin describe, tag and people-tag", () => {
    expect(() => {
      return assertMayEditItemContent({
        viewer: OTHER_UPLOADER,
        code: "item_edit_forbidden",
      });
    }).not.toThrow();

    expect(() => {
      return assertMayEditItemContent({
        viewer: ADMIN,
        code: "item_edit_forbidden",
      });
    }).not.toThrow();
  });

  it("refuses a viewer with a 403 naming the code the route passed", () => {
    const error = (() => {
      try {
        assertMayEditItemContent({
          viewer: VIEWER,
          code: "item_edit_forbidden",
        });
        return undefined;
      } catch (caught: unknown) {
        // `ApiError` is a class, so this narrows rather than casts: a
        // different error is rethrown instead of being asserted against as
        // though it were the one the guard raised.
        if (!(caught instanceof ApiError)) {
          throw caught;
        }
        return caught;
      }
    })();

    expect(error?.statusCode).toBe(403);
    expect(error?.code).toBe("item_edit_forbidden");
  });

  it("refuses a demoted uploader on the item they themselves uploaded", () => {
    // The additive half is granted by the current role, not by history:
    // `conventions.md` says a `viewer` may do none of it, full stop. Having
    // uploaded this item before being demoted does not carry the role back.
    expect(() => {
      return assertMayEditItemContent({
        viewer: DEMOTED_UPLOADER,
        code: "item_edit_forbidden",
      });
    }).toThrow(ApiError);
  });
});

describe("assertMayChangeItemAccess", () => {
  it("lets the item's own uploader and any admin through", () => {
    expect(() => {
      return assertMayChangeItemAccess({
        viewer: UPLOADER,
        uploadedBy: UPLOADER.memberId,
        code: "item_delete_forbidden",
      });
    }).not.toThrow();

    expect(() => {
      return assertMayChangeItemAccess({
        viewer: ADMIN,
        uploadedBy: UPLOADER.memberId,
        code: "item_delete_forbidden",
      });
    }).not.toThrow();
  });

  it("refuses an uploader who did not upload it", () => {
    expect(() => {
      return assertMayChangeItemAccess({
        viewer: OTHER_UPLOADER,
        uploadedBy: UPLOADER.memberId,
        code: "item_delete_forbidden",
      });
    }).toThrow(ApiError);
  });

  it("lets a demoted uploader through on the item they themselves uploaded", () => {
    // The access-changing half runs on `items.uploaded_by = :me OR admin`,
    // with no role in the predicate at all (`items.md`: the DELETE and
    // capture-date routes both restate their authorisation this way). A
    // member an admin has since demoted to `viewer` keeps this half on what
    // they already put there, same as `conventions.md`'s "the item's own
    // uploader" reads: ownership, not the role column.
    expect(() => {
      return assertMayChangeItemAccess({
        viewer: DEMOTED_UPLOADER,
        uploadedBy: DEMOTED_UPLOADER.memberId,
        code: "item_delete_forbidden",
      });
    }).not.toThrow();
  });
});

describe("makeItemCapabilitiesFromItem", () => {
  it("gives a viewer nothing but the ask, and only when tagged", () => {
    expect(
      makeItemCapabilitiesFromItem({
        viewer: VIEWER,
        uploadedBy: UPLOADER.memberId,
        isPeopleTagged: true,
        hasOpenRemovalRequest: false,
      }),
    ).toEqual({
      canSetVisibility: false,
      canEditTags: false,
      canEditPeople: false,
      canDescribe: false,
      canFixCaptureDate: false,
      canDelete: false,
      canRequestRemoval: true,
      canSeeViewers: false,
    });
  });

  it("separates the additive half from the access-changing half", () => {
    const capabilities = makeItemCapabilitiesFromItem({
      viewer: OTHER_UPLOADER,
      uploadedBy: UPLOADER.memberId,
      isPeopleTagged: false,
      hasOpenRemovalRequest: false,
    });

    expect(capabilities.canEditTags).toBe(true);
    expect(capabilities.canDescribe).toBe(true);
    expect(capabilities.canSetVisibility).toBe(false);
    expect(capabilities.canFixCaptureDate).toBe(false);
    expect(capabilities.canDelete).toBe(false);
  });

  it("gives an admin everything, including who has been looking", () => {
    const capabilities = makeItemCapabilitiesFromItem({
      viewer: ADMIN,
      uploadedBy: UPLOADER.memberId,
      isPeopleTagged: false,
      hasOpenRemovalRequest: false,
    });

    expect(capabilities.canDelete).toBe(true);
    expect(capabilities.canSetVisibility).toBe(true);
    expect(capabilities.canSeeViewers).toBe(true);
  });

  it("allows a tagged uploader to ask and blocks an outstanding request", () => {
    expect(
      makeItemCapabilitiesFromItem({
        viewer: UPLOADER,
        uploadedBy: UPLOADER.memberId,
        isPeopleTagged: true,
        hasOpenRemovalRequest: false,
      }).canRequestRemoval,
    ).toBe(true);

    expect(
      makeItemCapabilitiesFromItem({
        viewer: VIEWER,
        uploadedBy: UPLOADER.memberId,
        isPeopleTagged: true,
        hasOpenRemovalRequest: true,
      }).canRequestRemoval,
    ).toBe(false);
  });

  it.each([UPLOADER, ADMIN])(
    "allows a tagged privileged member to ask until their own request is open ($role)",
    (viewer) => {
      const options = {
        viewer,
        uploadedBy: viewer.memberId,
        isPeopleTagged: true,
        hasOpenRemovalRequest: false,
      };
      expect(makeItemCapabilitiesFromItem(options).canRequestRemoval).toBe(
        true,
      );
      expect(
        makeItemCapabilitiesFromItem({
          ...options,
          hasOpenRemovalRequest: true,
        }).canRequestRemoval,
      ).toBe(false);
    },
  );

  it("splits ownership from role for a demoted uploader on their own item", () => {
    // Pins the one case the split's two predicates read differently on:
    // access-changing capabilities follow ownership (still theirs to
    // delete, move, or repoint), additive capabilities follow the current
    // role (no longer granted, because the role is what any uploader means).
    // `canSetVisibility` is true here on purpose: it is the ownership
    // predicate, and the visibility route layers its own role check on top
    // of this guard rather than this guard changing shape for it.
    const capabilities = makeItemCapabilitiesFromItem({
      viewer: DEMOTED_UPLOADER,
      uploadedBy: DEMOTED_UPLOADER.memberId,
      isPeopleTagged: true,
      hasOpenRemovalRequest: false,
    });

    expect(capabilities).toEqual({
      canSetVisibility: true,
      canEditTags: false,
      canEditPeople: false,
      canDescribe: false,
      canFixCaptureDate: true,
      canDelete: true,
      canRequestRemoval: true,
      canSeeViewers: false,
    });
  });
});

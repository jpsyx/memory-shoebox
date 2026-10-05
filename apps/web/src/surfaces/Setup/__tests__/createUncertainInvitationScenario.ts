import {
  INVITED,
  getSetupAnswerFromRequest,
  type SetupAnswer,
  type makeSetupNavigationHarnessFromOptions,
} from "@/testing/setupNavigationTestHelpers";

type UncertainInvitationScenario = {
  answer: Parameters<typeof makeSetupNavigationHarnessFromOptions>[0]["answer"];
  getPosts: () => number;
  getReads: () => number;
  setDirectoryAvailable: () => void;
};

function _getDirectoryAnswerFromAvailability(
  isAvailable: boolean,
): SetupAnswer {
  return isAvailable
    ? {
        body: {
          shape: "admin",
          members: [INVITED],
          activeAdminCount: 1,
          nextCursor: null,
        },
      }
    : { body: { error: "unavailable", message: "Unavailable" }, status: 503 };
}

/** Returns controllable uncertain-delivery responses and request counters. */
export function createUncertainInvitationScenario(): UncertainInvitationScenario {
  let isDirectoryAvailable = false;
  let isComplete = false;
  let posts = 0;
  let reads = 0;
  return {
    answer: ({ path, init }) => {
      if (path === "/api/setup/progress") {
        return { body: { needsInvitations: !isComplete } };
      }
      if (path === "/api/setup/complete") {
        isComplete = true;
        return { body: null, status: 204 };
      }
      if (path === "/api/members" && init?.method === "POST") {
        posts++;
        throw new TypeError("Lost response");
      }
      if (path === "/api/members") {
        reads++;
        return _getDirectoryAnswerFromAvailability(isDirectoryAvailable);
      }
      return getSetupAnswerFromRequest({ path });
    },
    getPosts: () => {
      return posts;
    },
    getReads: () => {
      return reads;
    },
    setDirectoryAvailable: () => {
      isDirectoryAvailable = true;
    },
  };
}

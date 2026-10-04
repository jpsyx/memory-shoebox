import { describe, it } from "vitest";
import { createTestApp } from "../helpers/createTestApp.ts";
import { NOW } from "../helpers/seedHelpers/seedHelpers.ts";
import {
  makeLifecycleContextFromTestApp,
  createLifecycleMilestone,
  checkLifecycleCandidates,
  attachLifecycleItem,
  reconcileLifecycleItem,
  requestLifecycleRemoval,
} from "./step7aLifecycleTestHelpers.ts";
import {
  verifyLifecycleReminder,
  declineLifecycleRequest,
  withdrawLifecycleRequest,
  deleteLifecycleItem,
  verifyLifecycleSettledRequests,
  verifyLifecycleMilestone,
  verifyLifecycleDeletedStorage,
  verifyLifecycleQueuedMail,
} from "./step7aLifecycleAssertions.ts";

// Catches stale filters, missing mail, settling after SET NULL, or lost occasions.
describe("step 7a integrated lifecycle", () => {
  it("keeps an occasion while three successive asks settle, rendering every mail outcome", async () => {
    const testApp = await createTestApp({
      clock: () => {
        return new Date(NOW);
      },
    });
    try {
      const context = await makeLifecycleContextFromTestApp(testApp);
      const milestoneId = await createLifecycleMilestone(context);
      await checkLifecycleCandidates(context, milestoneId);
      await attachLifecycleItem(context, milestoneId);
      await reconcileLifecycleItem(context, milestoneId);
      const first = await requestLifecycleRemoval(context);
      await verifyLifecycleReminder(context);
      await declineLifecycleRequest(context, first);
      const second = await requestLifecycleRemoval(context);
      await withdrawLifecycleRequest(context, second);
      const third = await requestLifecycleRemoval(context);
      await deleteLifecycleItem(context);
      const requestIds = { first, second, third };
      await verifyLifecycleSettledRequests(context, requestIds);
      await verifyLifecycleMilestone(context, milestoneId);
      await verifyLifecycleDeletedStorage(context);
      await verifyLifecycleQueuedMail(context, requestIds);
    } finally {
      await testApp.close();
    }
  });
});

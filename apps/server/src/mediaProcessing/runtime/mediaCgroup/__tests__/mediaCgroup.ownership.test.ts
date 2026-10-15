import { expect, it, vi } from "vitest";
import { fixture } from "../mediaCgroupTestFixture.ts";
import { createMediaCgroup } from "../mediaCgroup.ts";

it("reclaims a crash-left empty job and admits another owned lifetime", async () => {
  const group = await createMediaCgroup("/sys/fs/cgroup/owned");
  expect(fixture.removals).toBe(1);
  await group.checkHeadroom();
  await group.dispose();
  const subsequent = await createMediaCgroup("/sys/fs/cgroup/owned");
  await subsequent.checkHeadroom();
  await subsequent.dispose();
  expect(fixture.locked).toBe(false);
});
it("reclaims an empty group interrupted before controls were written without killing", async () => {
  fixture.controls.clear();
  const group = await createMediaCgroup("/sys/fs/cgroup/owned");
  expect(fixture.kills).toBe(0);
  expect(fixture.controls.get("memory.max")).toBe("268435456");
  await group.dispose();
});
it("refuses a live competing API owner without touching its job", async () => {
  fixture.locked = true;
  fixture.populated = true;
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "processing_group_owned",
  );
  expect(fixture.kills).toBe(0);
  expect(fixture.removals).toBe(0);
});
it("retires a configured orphan before admitting new work", async () => {
  fixture.populated = true;
  const group = await createMediaCgroup("/sys/fs/cgroup/owned");
  expect(fixture.kills).toBe(1);
  expect(fixture.removals).toBe(1);
  await group.dispose();
});
it("refuses an unknown populated group without killing it", async () => {
  fixture.populated = true;
  fixture.controls.clear();
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "processing_group_unrecognized",
  );
  expect(fixture.kills).toBe(0);
  expect(fixture.removals).toBe(0);
});
it("bounds orphan retirement and never admits a replacement over surviving children", async () => {
  vi.useFakeTimers();
  fixture.populated = true;
  fixture.stubborn = true;
  const failed = expect(
    createMediaCgroup("/sys/fs/cgroup/owned"),
  ).rejects.toThrow("processing_group_shutdown_failed");
  await vi.runAllTimersAsync();
  await failed;
  expect(fixture.kills).toBe(1);
  expect(fixture.removals).toBe(0);
  expect(fixture.locked).toBe(true);
});

it("refuses an identifiable live owner even if that process lost cooperative locking", async () => {
  fixture.live = true;
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "processing_group_owned",
  );
  expect(fixture.kills).toBe(0);
  expect(fixture.removals).toBe(0);
});
it("refuses an unidentifiable legacy group even when empty", async () => {
  fixture.legacy = true;
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "processing_group_legacy_unowned",
  );
  expect(fixture.kills).toBe(0);
  expect(fixture.removals).toBe(0);
});

it("anchors orphan controls to its opened directory before retiring it", async () => {
  fixture.populated = true;
  const group = await createMediaCgroup("/sys/fs/cgroup/owned");
  expect(fixture.killPaths[0]).toBe(`/proc/${process.pid}/fd/41/cgroup.kill`);
  await group.dispose();
});
it("refuses removal after directory replacement and retains ownership on failed disposal", async () => {
  const group = await createMediaCgroup("/sys/fs/cgroup/owned");
  fixture.replaced = true;
  await expect(group.dispose()).rejects.toThrow(
    "processing_group_identity_changed",
  );
  expect(fixture.removals).toBe(1);
  expect(fixture.locked).toBe(true);
});

it("removes only the new empty group after failed control initialization", async () => {
  fixture.failInitialization = true;
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "processing_isolation_unavailable",
  );
  expect(fixture.removals).toBe(2);
  expect(fixture.kills).toBe(0);
  expect(fixture.locked).toBe(false);
});
it("retains the root lock when failed initialization cannot remove its own group", async () => {
  fixture.failInitialization = true;
  fixture.failCleanup = true;
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "cleanup failed",
  );
  expect(fixture.removals).toBe(1);
  expect(fixture.locked).toBe(true);
});
it("does not remove a current name when group creation failed", async () => {
  fixture.failCreation = true;
  await expect(createMediaCgroup("/sys/fs/cgroup/owned")).rejects.toThrow(
    "processing_isolation_unavailable",
  );
  expect(fixture.removals).toBe(1);
  expect(fixture.locked).toBe(false);
});

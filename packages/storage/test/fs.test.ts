import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsStorage, type ObjectStorage } from "../src";
import { describeStorageContract } from "./contract";

const roots: string[] = [];

async function freshStorage() {
  const root = await mkdtemp(join(tmpdir(), "storage-fs-"));
  roots.push(root);
  return { storage: new FsStorage({ root }), base: "run" };
}

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describeStorageContract("fs", freshStorage);

describe("fs driver", () => {
  test("leaves no temporary files behind, even after a refused write", async () => {
    const { storage } = await freshStorage();
    await storage.put("run/x.json", "1", { ifNoneMatch: "*" });
    await storage.put("run/x.json", "2", { ifNoneMatch: "*" }).catch(() => {});
    const root = roots.at(-1) ?? "";
    expect(await readdir(join(root, "run"))).toEqual(["x.json"]);
  });

  test("stores objects as plain files under the root", async () => {
    const { storage } = await freshStorage();
    await storage.put("run/nested/deep/file.json", "{}");
    const root = roots.at(-1) ?? "";
    expect(await Bun.file(join(root, "run/nested/deep/file.json")).text()).toBe("{}");
  });
});

describe("fs presigned uploads", () => {
  test("there are none: uploads go through the API", async () => {
    const { storage }: { storage: ObjectStorage } = await freshStorage();
    expect(
      await storage.presignPut("uploads/a.pdf", {
        contentType: "application/pdf",
        contentLength: 10,
        expiresInSeconds: 60,
      }),
    ).toBeNull();
    expect(
      storage.presignPut("../escape.pdf", {
        contentType: "application/pdf",
        contentLength: 10,
        expiresInSeconds: 60,
      }),
    ).rejects.toThrow();
  });
});

describe("fs presigned downloads", () => {
  test("there are none: the API serves files itself", async () => {
    const { storage }: { storage: ObjectStorage } = await freshStorage();
    expect(await storage.presignGet("video/a.mp4", 300)).toBeNull();
    expect(storage.presignGet("../escape.mp4", 300)).rejects.toThrow();
  });
});

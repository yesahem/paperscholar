import { describe, expect, test } from "bun:test";
import {
  InvalidKeyError,
  PreconditionFailedError,
  RangeNotSatisfiableError,
  type ObjectStorage,
} from "../src";

const decode = (body: Uint8Array) => new TextDecoder().decode(body);

async function collect(iterable: AsyncIterable<{ key: string }>): Promise<string[]> {
  const keys: string[] = [];
  for await (const item of iterable) keys.push(item.key);
  return keys;
}

/**
 * Behaviour every ObjectStorage driver must have. `createStorage` returns a
 * driver and a key prefix that is empty for this test run.
 */
export function describeStorageContract(
  name: string,
  createStorage: () => Promise<{ storage: ObjectStorage; base: string }>,
) {
  describe(`${name} storage contract`, () => {
    test("writes and reads text and bytes", async () => {
      const { storage, base } = await createStorage();
      await storage.put(`${base}/a.json`, '{"a":1}', { contentType: "application/json" });
      await storage.put(`${base}/b.bin`, new Uint8Array([1, 2, 3]));

      const text = await storage.get(`${base}/a.json`);
      expect(text && decode(text.body)).toBe('{"a":1}');
      expect(text?.size).toBe(7);
      expect(text?.contentType).toStartWith("application/json");
      expect([...((await storage.get(`${base}/b.bin`))?.body ?? [])]).toEqual([1, 2, 3]);
    });

    test("missing keys read as null", async () => {
      const { storage, base } = await createStorage();
      expect(await storage.get(`${base}/missing.json`)).toBeNull();
      expect(await storage.head(`${base}/missing.json`)).toBeNull();
      expect(await storage.getIfChanged(`${base}/missing.json`, '"x"')).toEqual({
        status: "not-found",
      });
    });

    test("the etag changes when the content is replaced", async () => {
      const { storage, base } = await createStorage();
      const first = await storage.put(`${base}/v.json`, "1");
      const second = await storage.put(`${base}/v.json`, "22");
      expect(first.etag).not.toBe(second.etag);
      expect((await storage.head(`${base}/v.json`))?.etag).toBe(second.etag);
    });

    test("create-once writes refuse an existing key and leave it unchanged", async () => {
      const { storage, base } = await createStorage();
      await storage.put(`${base}/once.json`, "first", { ifNoneMatch: "*" });
      expect(
        storage.put(`${base}/once.json`, "second", { ifNoneMatch: "*" }),
      ).rejects.toThrow(PreconditionFailedError);
      const object = await storage.get(`${base}/once.json`);
      expect(object && decode(object.body)).toBe("first");
    });

    test("only one of several concurrent create-once writes succeeds", async () => {
      const { storage, base } = await createStorage();
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) =>
          storage.put(`${base}/race.json`, `writer-${i}`, { ifNoneMatch: "*" }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const result of results) {
        if (result.status === "rejected") {
          expect(result.reason).toBeInstanceOf(PreconditionFailedError);
        }
      }
    });

    test("if-match writes succeed only against the current etag", async () => {
      const { storage, base } = await createStorage();
      const { etag } = await storage.put(`${base}/index.json`, "v1");

      expect(
        storage.put(`${base}/index.json`, "v2", { ifMatch: '"stale"' }),
      ).rejects.toThrow(PreconditionFailedError);
      const updated = await storage.put(`${base}/index.json`, "v2", { ifMatch: etag });
      expect(updated.etag).not.toBe(etag);
      expect(storage.put(`${base}/absent.json`, "v1", { ifMatch: etag })).rejects.toThrow(
        PreconditionFailedError,
      );
    });

    test("conditional reads skip unchanged objects", async () => {
      const { storage, base } = await createStorage();
      const { etag } = await storage.put(`${base}/c.json`, "one");
      expect(await storage.getIfChanged(`${base}/c.json`, etag)).toEqual({
        status: "not-modified",
      });
      await storage.put(`${base}/c.json`, "two");
      const changed = await storage.getIfChanged(`${base}/c.json`, etag);
      expect(changed.status).toBe("found");
      if (changed.status === "found") expect(decode(changed.object.body)).toBe("two");
    });

    test("deleting is idempotent", async () => {
      const { storage, base } = await createStorage();
      await storage.put(`${base}/d.json`, "x");
      await storage.delete(`${base}/d.json`);
      await storage.delete(`${base}/d.json`);
      expect(await storage.head(`${base}/d.json`)).toBeNull();
    });

    test("lists keys under a prefix, in key order", async () => {
      const { storage, base } = await createStorage();
      for (const key of [
        "papers/b/v1/public.json",
        "papers/a/v2/public.json",
        "papers/a/v1/public.json",
        "tracks.json",
      ]) {
        await storage.put(`${base}/${key}`, "{}");
      }
      expect(await collect(storage.list(`${base}/papers/`))).toEqual([
        `${base}/papers/a/v1/public.json`,
        `${base}/papers/a/v2/public.json`,
        `${base}/papers/b/v1/public.json`,
      ]);
      expect(await collect(storage.list(`${base}/nothing-here/`))).toEqual([]);
    });

    test("streams the whole object or a byte range of it", async () => {
      const { storage, base } = await createStorage();
      const key = `${base}/video/clip.mp4`;
      await storage.put(key, new TextEncoder().encode("0123456789"), {
        contentType: "video/mp4",
      });
      const read = async (range: { start: number; end: number | null } | null) => {
        const part = await storage.getRange(key, range);
        if (!part) throw new Error("expected the object");
        const text = await new Response(part.body).text();
        return { text, start: part.start, end: part.end, totalSize: part.totalSize };
      };
      expect(await read(null)).toEqual({
        text: "0123456789",
        start: 0,
        end: 9,
        totalSize: 10,
      });
      expect(await read({ start: 2, end: 4 })).toEqual({
        text: "234",
        start: 2,
        end: 4,
        totalSize: 10,
      });
      expect(await read({ start: 7, end: null })).toEqual({
        text: "789",
        start: 7,
        end: 9,
        totalSize: 10,
      });
      // An end past the object is cut to the last byte, as HTTP does.
      expect(await read({ start: 8, end: 100 })).toMatchObject({ text: "89", end: 9 });
      expect((await storage.getRange(key, null))?.contentType).toStartWith("video/mp4");
      expect(storage.getRange(key, { start: 10, end: null })).rejects.toThrow(
        RangeNotSatisfiableError,
      );
      expect(await storage.getRange(`${base}/video/missing.mp4`, null)).toBeNull();
    });

    test("rejects keys that could escape the storage root", async () => {
      const { storage, base } = await createStorage();
      for (const key of [
        "",
        "../etc/passwd",
        `${base}/../x`,
        "/absolute",
        `${base}//double`,
        `${base}/.hidden`,
        "back\\slash",
      ]) {
        expect(storage.put(key, "x")).rejects.toThrow(InvalidKeyError);
      }
    });
  });
}

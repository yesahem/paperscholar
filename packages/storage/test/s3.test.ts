import { describe, expect, test } from "bun:test";
import { S3Storage } from "../src";
import { describeStorageContract } from "./contract";

/**
 * Runs the contract against an S3-compatible server when one is configured:
 * `docker compose -f docker-compose.dev.yml up -d objectstore` locally, a
 * service container in CI. Skipped otherwise.
 */
const endpoint = process.env.S3_TEST_ENDPOINT;
const accessKeyId = process.env.S3_TEST_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_TEST_SECRET_ACCESS_KEY;
const bucket = process.env.S3_TEST_BUCKET ?? "storage-tests";
const configured = Boolean(endpoint && accessKeyId && secretAccessKey);

const storage = configured
  ? new S3Storage({
      endpoint: endpoint ?? "",
      region: "us-east-1",
      bucket,
      accessKeyId: accessKeyId ?? "",
      secretAccessKey: secretAccessKey ?? "",
    })
  : undefined;

let bucketReady: Promise<void> | undefined;

describe.skipIf(!configured)("s3 driver", () => {
  describeStorageContract("s3", async () => {
    if (!storage) throw new Error("S3 test server is not configured");
    bucketReady ??= storage.createBucketIfMissing();
    await bucketReady;
    return { storage, base: `run-${crypto.randomUUID()}` };
  });
});

describe.skipIf(!configured)("s3 presigned uploads", () => {
  async function ready(): Promise<S3Storage> {
    if (!storage) throw new Error("S3 test server is not configured");
    bucketReady ??= storage.createBucketIfMissing();
    await bucketReady;
    return storage;
  }

  test("a browser can PUT exactly the signed object, and nothing else", async () => {
    const s3 = await ready();
    const key = `run-${crypto.randomUUID()}/upload.pdf`;
    const body = new TextEncoder().encode("%PDF-1.4 a small test file");
    const upload = await s3.presignPut(key, {
      contentType: "application/pdf",
      contentLength: body.byteLength,
      expiresInSeconds: 600,
    });
    if (!upload) throw new Error("the s3 driver should presign");
    expect(upload.url).toContain("X-Amz-Signature=");
    expect(upload.url).toContain("X-Amz-Expires=600");
    expect(upload.headers).toEqual({
      "content-type": "application/pdf",
      "content-length": String(body.byteLength),
    });

    // A different size or type does not match the signature.
    const bigger = await fetch(upload.url, {
      method: "PUT",
      headers: { "content-type": "application/pdf" },
      body: new Uint8Array(body.byteLength + 10),
    });
    expect(bigger.ok).toBe(false);
    const html = await fetch(upload.url, {
      method: "PUT",
      headers: { "content-type": "text/html" },
      body,
    });
    expect(html.ok).toBe(false);
    expect(await s3.head(key)).toBeNull();

    const response = await fetch(upload.url, {
      method: "PUT",
      headers: upload.headers,
      body,
    });
    expect(response.ok).toBe(true);
    const stored = await s3.get(key);
    expect(stored?.size).toBe(body.byteLength);
    expect(stored?.contentType).toBe("application/pdf");
    await s3.delete(key);
  });
});
